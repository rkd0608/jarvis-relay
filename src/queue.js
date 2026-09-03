let chain = Promise.resolve();
let active = 0;
let queued = 0;

export function enqueue(job) {
  queued++;
  const run = chain.then(async () => {
    queued--;
    active++;
    try {
      await job();
    } finally {
      active--;
    }
  });
  chain = run.catch(() => {});
  return run;
}

export function queueInfo() {
  return { active, queued };
}
