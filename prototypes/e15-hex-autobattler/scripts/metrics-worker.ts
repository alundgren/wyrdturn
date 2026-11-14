// Worker thread for scripts/metrics.ts: runs batches of jobs.
import { parentPort } from "node:worker_threads";
import { type Job, runJob } from "./jobs.ts";

parentPort!.on("message", (jobs: Job[]) => parentPort!.postMessage(jobs.map(runJob)));
