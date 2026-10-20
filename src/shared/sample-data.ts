// The four fictional personas in sample-data/, parsed against the contracts.
// Use them as mock answers for askModel and as test data until real data arrives.
import { z } from "zod";
import { JobSchema, MatchResultSchema, ProfileSchema, type Job, type MatchResult, type Profile } from "@/shared/contracts";
import danielJobs from "../../sample-data/personas/daniel/jobs.json";
import danielMatch from "../../sample-data/personas/daniel/match.json";
import danielProfile from "../../sample-data/personas/daniel/profile.json";
import emmaJobs from "../../sample-data/personas/emma/jobs.json";
import emmaMatch from "../../sample-data/personas/emma/match.json";
import emmaProfile from "../../sample-data/personas/emma/profile.json";
import rezaJobs from "../../sample-data/personas/reza/jobs.json";
import rezaMatch from "../../sample-data/personas/reza/match.json";
import rezaProfile from "../../sample-data/personas/reza/profile.json";
import saraJobs from "../../sample-data/personas/sara/jobs.json";
import saraMatch from "../../sample-data/personas/sara/match.json";
import saraProfile from "../../sample-data/personas/sara/profile.json";

export type Persona = {
  profile: Profile;
  /** Two jobs; the match is for the first one. */
  jobs: Job[];
  match: MatchResult;
};

function persona(profile: unknown, jobs: unknown, match: unknown): Persona {
  return {
    profile: ProfileSchema.parse(profile),
    jobs: z.array(JobSchema).length(2).parse(jobs),
    match: MatchResultSchema.parse(match),
  };
}

export const personas = {
  /** MSc graduate looking for a data analyst job in Manchester. */
  sara: persona(saraProfile, saraJobs, saraMatch),
  /** Former teacher looking for project coordination in London. */
  reza: persona(rezaProfile, rezaJobs, rezaMatch),
  /** Junior developer looking for remote work. */
  emma: persona(emmaProfile, emmaJobs, emmaMatch),
  /** Store manager with 15 years' experience looking for operations management in Birmingham. */
  daniel: persona(danielProfile, danielJobs, danielMatch),
} satisfies Record<string, Persona>;

export type PersonaName = keyof typeof personas;
