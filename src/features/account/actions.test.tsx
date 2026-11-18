import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { brand } from "@/shared/brand";
import { requestPasswordReset, setNewPassword, signIn, signOut, signUp } from "./actions";
import { AuthForm, CheckEmailNotice, revealAutofilledPassword, ShowPasswordButton } from "./auth-form";
import { ForgotPasswordForm, NewPasswordForm, ResetLinkExpired, ResetLinkSent } from "./password-reset-forms";

const { createSupabaseServerClient, redirect, auth } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  // The real redirect() throws to stop the action, so this one does too.
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect ${url}`);
  }),
  auth: {
    signInWithPassword: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    resetPasswordForEmail: vi.fn(),
    getUser: vi.fn(),
    updateUser: vi.fn(),
  },
}));
vi.mock("@/shared/supabase/server", () => ({ createSupabaseServerClient }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ origin: "https://cvision.test" }) }));
vi.mock("next/link", () => ({
  // Marked, so a test can tell Next's Link from a plain link, which loads a new page.
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} data-next-link="" {...props}>
      {children}
    </a>
  ),
}));

function form(fields: Record<string, string>) {
  const data = new FormData();
  data.set("email", "sara@example.com");
  data.set("password", "correct-horse");
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  createSupabaseServerClient.mockResolvedValue({ auth });
  auth.signInWithPassword.mockResolvedValue({ error: null });
  auth.signUp.mockResolvedValue({ data: { session: null }, error: null });
});

describe("signIn", () => {
  it("sends the user back to the page they came from", async () => {
    await expect(signIn({}, form({ next: "/interview?job=1" }))).rejects.toThrow("redirect /interview?job=1");
  });

  it.each([undefined, "https://evil.com", "//evil.com", "/\\evil.com"])("sends next=%j to the dashboard", async (next) => {
    await expect(signIn({}, form(next === undefined ? {} : { next }))).rejects.toThrow("redirect /dashboard");
  });

  it("does not redirect when the password is wrong", async () => {
    auth.signInWithPassword.mockResolvedValue({ error: new Error("Invalid login credentials") });
    expect(await signIn({}, form({ next: "/interview?job=1" }))).toEqual({
      error: "That email and password do not match an account.",
    });
    expect(redirect).not.toHaveBeenCalled();
  });

  // Signing in before the link in the email is opened once said the password was wrong (#507).
  it("says the email isn't confirmed yet, and how to get a new link", async () => {
    const error = Object.assign(new Error("Email not confirmed"), { code: "email_not_confirmed" });
    auth.signInWithPassword.mockResolvedValue({ error });
    expect(await signIn({}, form({ next: "/profile" }))).toEqual({
      error:
        "Your email isn’t confirmed yet. Open the link we sent you, then sign in. If the link has expired, create your account again to get a new one.",
    });
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("signUp", () => {
  it("puts the page the user came from in the confirmation email link", async () => {
    expect(await signUp({}, form({ next: "/interview?job=1" }))).toEqual({ checkEmail: "sara@example.com" });
    const { emailRedirectTo } = auth.signUp.mock.calls[0][0].options;
    expect(emailRedirectTo).toBe("https://cvision.test/auth/confirm?next=%2Finterview%3Fjob%3D1");
  });

  it("keeps another site out of the confirmation email link", async () => {
    await signUp({}, form({ next: "https://evil.com" }));
    expect(auth.signUp.mock.calls[0][0].options.emailRedirectTo).toBe("https://cvision.test/auth/confirm?next=%2Fdashboard");
  });

  // Supabase sends no email for an address that already has an account, and returns a user with no identities (#328).
  it("says the email already has an account instead of 'Check your email', which would never come", async () => {
    auth.signUp.mockResolvedValue({ data: { session: null, user: { identities: [] } }, error: null });
    expect(await signUp({}, form({ next: "/interview?job=1" }))).toEqual({ existingAccount: "sara@example.com" });
  });

  it("still says 'Check your email' for a new address", async () => {
    auth.signUp.mockResolvedValue({ data: { session: null, user: { identities: [{ id: "1" }] } }, error: null });
    expect(await signUp({}, form({}))).toEqual({ checkEmail: "sara@example.com" });
  });

  it("sends the user straight back when no confirmation is needed", async () => {
    auth.signUp.mockResolvedValue({ data: { session: {} }, error: null });
    await expect(signUp({}, form({ next: "/interview?job=1" }))).rejects.toThrow("redirect /interview?job=1");
  });
});

describe("signOut", () => {
  it("signs out this browser only, so each device clears its own data when it signs out", async () => {
    auth.signOut.mockResolvedValue({ error: null });
    await expect(signOut()).rejects.toThrow("redirect /");
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  // Next keeps recent pages alive; a full load after sign-out leaves none of this account's pages in the tab (#350).
  it("returns home for a full page load when the form asks for one, instead of redirecting", async () => {
    auth.signOut.mockResolvedValue({ error: null });
    const data = new FormData();
    data.set("reload", "1");
    expect(await signOut({}, data)).toEqual({ go: "/" });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("full page load after signing in (#350)", () => {
  it("returns the next page instead of redirecting when the form asks for a full load", async () => {
    expect(await signIn({}, form({ next: "/interview?job=1", reload: "1" }))).toEqual({ go: "/interview?job=1" });
    expect(redirect).not.toHaveBeenCalled();
  });

  it("still redirects a form without JavaScript, where the redirect is a full load anyway", async () => {
    await expect(signIn({}, form({ next: "/profile" }))).rejects.toThrow("redirect /profile");
  });

  it("returns the next page after a sign-up that signs straight in", async () => {
    auth.signUp.mockResolvedValue({ data: { session: {}, user: { identities: [{}] } }, error: null });
    expect(await signUp({}, form({ next: "/profile", reload: "1" }))).toEqual({ go: "/profile" });
  });

  // A pilot asked to see the password while typing it (8 November).
  it("offers a Show password toggle that starts hidden and points at the password field", () => {
    const html = renderToStaticMarkup(<AuthForm mode="sign-in" />);
    const input = html.match(/<input[^>]*name="password"[^>]*>/)?.[0] ?? "";
    const button = html.match(/<button[^>]*aria-controls="[^"]+"[^>]*>Show<\/button>/)?.[0] ?? "";
    expect(input).toContain('type="password"');
    expect(button).toContain('aria-label="Show password"');
    // The button points at this field, not just any id.
    const inputId = input.match(/ id="([^"]+)"/)?.[1];
    expect(inputId).toBeTruthy();
    expect(button).toContain(`aria-controls="${inputId}"`);
  });

  // Found in the batch review: shown, the field is plain text, which a phone keyboard would capitalise or correct.
  it("keeps a phone keyboard from capitalising or correcting the password while it is shown", () => {
    const input = renderToStaticMarkup(<AuthForm mode="sign-up" />).match(/<input[^>]*name="password"[^>]*>/)?.[0] ?? "";
    expect(input).toContain('autoCapitalize="none"');
    expect(input).toContain('autoCorrect="off"');
    expect(input).toContain('spellCheck="false"');
  });

  // Safari kept a password it had filled in itself masked after Show (18 November, #521).
  it("lifts Safari's own mask from a password it filled in, and does nothing in other browsers", () => {
    let sets = 0;
    const field = (matches: (selector: string) => boolean) => {
      let value = "secret-pass";
      return {
        matches,
        get value() {
          return value;
        },
        set value(next: string) {
          sets += 1;
          value = next;
        },
      };
    };

    const masked = field((selector) => selector === ":-webkit-autofill-and-obscured");
    revealAutofilledPassword(masked);
    expect(sets).toBe(1);
    expect(masked.value).toBe("secret-pass");

    sets = 0;
    revealAutofilledPassword(field(() => false));
    expect(sets).toBe(0);

    // A Strong Password Safari made is left alone, so Safari still saves it to the Keychain.
    revealAutofilledPassword(
      field((selector) => selector === ":-webkit-autofill-and-obscured" || selector === ":-webkit-autofill-strong-password"),
    );
    expect(sets).toBe(0);

    // Chrome and Firefox don't know the selector and throw: nothing breaks.
    expect(() =>
      revealAutofilledPassword(
        field(() => {
          throw new SyntaxError("unknown pseudo-class");
        }),
      ),
    ).not.toThrow();
    expect(sets).toBe(0);
    expect(() => revealAutofilledPassword(null)).not.toThrow();
  });

  // WCAG 2.5.3, Label in Name: the word on the button is in its name, so "click Hide" works with voice control.
  it("names the toggle by what it will do, with the word the user sees", () => {
    const hidden = renderToStaticMarkup(<ShowPasswordButton shown={false} controls="pw" onToggle={() => {}} />);
    const shown = renderToStaticMarkup(<ShowPasswordButton shown controls="pw" onToggle={() => {}} />);
    expect(hidden).toMatch(/aria-label="Show password"[^>]*>Show<\/button>/);
    expect(shown).toMatch(/aria-label="Hide password"[^>]*>Hide<\/button>/);
    expect(shown).not.toContain("aria-pressed");
  });

  it("asks for the full load only once JavaScript runs: the server-rendered form has no such field", () => {
    expect(renderToStaticMarkup(<AuthForm mode="sign-in" />)).not.toContain('name="reload"');
  });
});

describe("AuthForm", () => {
  it("keeps the return address in the form and in the link to the other form", () => {
    const html = renderToStaticMarkup(<AuthForm mode="sign-in" next="/interview?job=1" />);
    expect(html).toContain('<input type="hidden" name="next" value="/interview?job=1"/>');
    expect(html).toContain('href="/sign-up?next=%2Finterview%3Fjob%3D1"');
  });

  it("links to the other form plainly without a return address", () => {
    const html = renderToStaticMarkup(<AuthForm mode="sign-up" />);
    expect(html).toContain('href="/sign-in"');
  });
});

describe("CheckEmailNotice (#507)", () => {
  const html = renderToStaticMarkup(<CheckEmailNotice email="sara@example.com" next="/profile" />);
  const words = html.replace(/<[^>]+>/g, "");

  it("says who sends the email, how long it can take and where else to look", () => {
    expect(words).toContain(
      `We sent a link to sara@example.com. Open it to finish creating your account. It comes from ${brand.contactEmail} and can take a few minutes. If it isn’t in your inbox, look in your spam or junk folder.`,
    );
  });

  it("offers a different email and Sign in, both keeping the return address", () => {
    expect(words).toContain("Wrong address? Use a different email");
    expect(words).toContain("Already opened the link? Sign in");
    // A plain link: only a new page brings back the empty form.
    expect(html).toMatch(/<a href="\/sign-up\?next=%2Fprofile" class="[^"]*">Use a different email<\/a>/);
    expect(html).toMatch(/<a href="\/sign-in\?next=%2Fprofile" data-next-link=""[^>]*>Sign in<\/a>/);
  });
});

// "Forgot your password?" (#524): a user had no way back into their account without the password.
describe("requestPasswordReset", () => {
  const reset = (fields: Record<string, string> = {}) => {
    const data = new FormData();
    data.set("email", "sara@example.com");
    for (const [name, value] of Object.entries(fields)) data.set(name, value);
    return data;
  };

  beforeEach(() => {
    auth.resetPasswordForEmail.mockResolvedValue({ error: null });
  });

  it("sends a link that signs the user in and opens the new password page, keeping where they were heading", async () => {
    expect(await requestPasswordReset({}, reset({ next: "/tailor?job=1" }))).toEqual({ sentTo: "sara@example.com" });
    const [email, options] = auth.resetPasswordForEmail.mock.calls[0];
    expect(email).toBe("sara@example.com");
    const link = new URL(options.redirectTo);
    expect(`${link.origin}${link.pathname}`).toBe("https://cvision.test/auth/confirm");
    expect(link.searchParams.get("next")).toBe("/sign-in/new-password?next=%2Ftailor%3Fjob%3D1");
  });

  it("lands on the new password page alone when there is nowhere else to go", async () => {
    await requestPasswordReset({}, reset());
    expect(new URL(auth.resetPasswordForEmail.mock.calls[0][1].redirectTo).searchParams.get("next")).toBe("/sign-in/new-password");
  });

  it("never lets next take the user to another site", async () => {
    await requestPasswordReset({}, reset({ next: "//evil.com" }));
    expect(new URL(auth.resetPasswordForEmail.mock.calls[0][1].redirectTo).searchParams.get("next")).toBe("/sign-in/new-password");
  });

  it("asks for a valid email before sending anything", async () => {
    expect(await requestPasswordReset({}, reset({ email: "not-an-email" }))).toEqual({ fieldError: "Enter a valid email address." });
    expect(auth.resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("says to wait when a link was just sent", async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ error: { code: "over_email_send_rate_limit", status: 429 } });
    expect(await requestPasswordReset({}, reset())).toEqual({ error: "We’ve just sent a link. Wait a minute, then try again." });
  });

  it("says when the link was not sent, without saying whether the email has an account", async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ error: { code: "unexpected_failure", status: 500 } });
    expect(await requestPasswordReset({}, reset())).toEqual({ error: "We couldn’t send the link just now. Try again in a minute." });
  });

  it("says accounts are not switched on while there is no database", async () => {
    createSupabaseServerClient.mockResolvedValue(null);
    expect((await requestPasswordReset({}, reset())).error).toContain("Accounts are not switched on yet");
  });
});

describe("setNewPassword", () => {
  const newPassword = (fields: Record<string, string> = {}) => {
    const data = new FormData();
    data.set("password", "a-new-password");
    for (const [name, value] of Object.entries(fields)) data.set(name, value);
    return data;
  };

  beforeEach(() => {
    auth.getUser.mockResolvedValue({ data: { user: { id: "user-1", email: "sara@example.com" } } });
    auth.updateUser.mockResolvedValue({ error: null });
  });

  it("saves the new password and goes on to the page the user was heading to", async () => {
    await expect(setNewPassword({}, newPassword({ next: "/profile" }))).rejects.toThrow("redirect /profile");
    expect(auth.updateUser).toHaveBeenCalledWith({ password: "a-new-password" });
  });

  it("returns where to load when the form asked for a full page load (#350)", async () => {
    expect(await setNewPassword({}, newPassword({ next: "/profile", reload: "1" }))).toEqual({ go: "/profile" });
  });

  it("changes nothing when the link signed nobody in, and offers a new link", async () => {
    auth.getUser.mockResolvedValue({ data: { user: null } });
    expect(await setNewPassword({}, newPassword())).toEqual({ expired: true });
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("asks for at least 8 characters before saving", async () => {
    expect(await setNewPassword({}, newPassword({ password: "short" }))).toEqual({ fieldError: "Use at least 8 characters." });
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("says so when the new password is the old one", async () => {
    auth.updateUser.mockResolvedValue({ error: { code: "same_password" } });
    expect(await setNewPassword({}, newPassword())).toEqual({ fieldError: "Choose a password you haven’t used for this account before." });
  });
});

describe("the password reset forms (#524)", () => {
  it("offers Forgot your password on the sign-in form only, keeping where the user was heading", () => {
    const signInForm = renderToStaticMarkup(<AuthForm mode="sign-in" next="/profile" />);
    expect(signInForm).toContain('href="/sign-in/forgot?next=%2Fprofile"');
    expect(signInForm).toContain("Forgot your password?");
    expect(renderToStaticMarkup(<AuthForm mode="sign-up" next="/profile" />)).not.toContain("Forgot your password?");
  });

  it("asks only for the email, with one main button", () => {
    const html = renderToStaticMarkup(<ForgotPasswordForm next="/profile" />);
    const email = html.match(/<input[^>]*name="email"[^>]*>/)?.[0] ?? "";
    expect(email).toContain('type="email"');
    expect(html).toContain(">Send me a link</button>");
    expect(html.match(/bg-cta/g)).toHaveLength(1);
    expect(html).toContain('href="/sign-in?next=%2Fprofile"');
  });

  it("says the same after sending whether or not the email has an account", () => {
    const html = renderToStaticMarkup(<ResetLinkSent email="sara@example.com" next="/dashboard" />);
    expect(html).toContain("If sara@example.com has a CVision account, we’ve sent it a link");
    expect(html).toContain(brand.contactEmail);
    expect(html).toContain('href="/sign-in/forgot"');
  });

  it("asks for a new password of at least 8 characters, for the account the link signed in", () => {
    const html = renderToStaticMarkup(<NewPasswordForm email="sara@example.com" next="/profile" />);
    expect(html).toContain("For sara@example.com");
    const field = html.match(/<input[^>]*name="password"[^>]*>/)?.[0] ?? "";
    expect(field).toContain('type="password"');
    expect(field).toContain('autoComplete="new-password"');
    expect(field).toContain('minLength="8"');
    expect(html).toContain(">Save my new password</button>");
  });

  it("offers a new link when the old one no longer works", () => {
    const html = renderToStaticMarkup(<ResetLinkExpired next="/profile" />);
    expect(html).toContain("This link has expired");
    expect(html).toContain('href="/sign-in/forgot?next=%2Fprofile"');
  });
});
