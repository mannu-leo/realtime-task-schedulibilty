/**
 * ==============================================================
 * REAL-TIME TASK SCHEDULABILITY ANALYSER - FRONTEND ENGINE
 * Pure Vanilla JavaScript (ES6+)
 * 
 * Features:
 * - Mathematical Schedulability (Utilization, Liu-Layland, Exact RTA, EDF)
 * - Discrete-Time Event Simulator (Preemptive RMS, Preemptive EDF, Non-preemptive FCFS)
 * - Interactive HTML5 Canvas Gantt Chart with Play/Pause/Step/Speed
 * - Multi-Algorithm Comparison Benchmarking
 * - MySQL REST API Integration (Save, Fetch, Delete, Dashboard Telemetry)
 * - Printable Technical Report Generation
 * ==============================================================
 */

// Application Global State
const state = {
  // Active Periodic Task Set
  // Default: Classic OS textbook sample (Utilization = 85.0%)
  tasks: [
    { id: 'T1', name: 'T1', c: 1, t: 4, d: 4, a: 0 },
    { id: 'T2', name: 'T2', c: 2, t: 5, d: 5, a: 0 },
    { id: 'T3', name: 'T3', c: 1, t: 10, d: 10, a: 0 },
    { id: 'T4', name: 'T4', c: 2, t: 20, d: 20, a: 0 }
  ],
  
  // Simulation Execution State
  currentAlgo: 'RMS',
  simulationHorizon: 20,
  simResult: null,       // Output of discrete-time simulation
  
  // Gantt Playback Animation State
  playbackTime: 0,
  isPlaying: false,
  timerId: null,
  playbackSpeedMs: 500,

  // Database Connection State
  dbConnected: false,
  savedSimulations: []
};

// Task Palette Colors for Visual Gantt Rendering
const TASK_COLORS = [
  '#06b6d4', // Cyan
  '#3b82f6', // Electric Blue
  '#10b981', // Emerald
  '#8b5cf6', // Violet
  '#f59e0b', // Amber
  '#ec4899', // Pink
  '#14b8a6', // Teal
  '#6366f1'  // Indigo
];

function getTaskColor(index) {
  return TASK_COLORS[index % TASK_COLORS.length];
}

// ==============================================================
// 1. INITIALIZATION & SPA ROUTING
// ==============================================================

document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initSystemClock();
  initTaskConfigEvents();
  initSchedulabilityEvents();
  initSimulationEvents();
  initComparisonEvents();
  initHistoryEvents();
  initReportEvents();
  
  // Initial Calculation & Render
  recalculateAll();
  checkDatabaseStatus();
  fetchDashboardStats();
  
  // Quick Sample button in header
  document.getElementById('btn-quick-sample').addEventListener('click', () => {
    loadSampleTaskSet();
    showToast('Loaded standard 4-task sample set (Utilization: 85.0%)', 'info');
  });

  // Close notice banner handler
  const btnCloseNotice = document.getElementById('btn-close-notice');
  if (btnCloseNotice) {
    btnCloseNotice.addEventListener('click', () => {
      document.getElementById('db-notice-banner').classList.add('hidden');
    });
  }
});

/**
 * Single-Page-App Tab Switching Navigation
 */
function initNavigation() {
  const navButtons = document.querySelectorAll('.nav-item');
  const viewPanels = document.querySelectorAll('.view-panel');
  const pageTitle = document.getElementById('page-title');
  const pageDescription = document.getElementById('page-description');

  const titles = {
    'dashboard': { title: 'System Dashboard', desc: 'Real-time scheduling analytics, bounds, and performance metrics' },
    'task-config': { title: 'Task Configuration', desc: 'Define real-time execution times, periods, and relative deadlines' },
    'schedulability': { title: 'Schedulability Analysis', desc: 'Liu-Layland utilization bound and Joseph-Pandya Response Time Analysis' },
    'cpu-simulation': { title: 'CPU Simulation & Gantt Timeline', desc: 'Discrete-time execution engine with interactive timeline playback' },
    'algorithm-comparison': { title: 'Algorithm Comparison Benchmark', desc: 'Direct side-by-side performance comparison: RMS vs. EDF vs. FCFS' },
    'simulation-history': { title: 'Simulation History', desc: 'MySQL database archived runs and timeline verification records' }
  };

  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      
      navButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      viewPanels.forEach(panel => {
        panel.classList.remove('active');
        if (panel.id === `view-${targetTab}`) {
          panel.classList.add('active');
        }
      });

      if (titles[targetTab]) {
        pageTitle.textContent = titles[targetTab].title;
        pageDescription.textContent = titles[targetTab].desc;
      }

      // Contextual refresh on entering views
      if (targetTab === 'dashboard') {
        fetchDashboardStats();
      } else if (targetTab === 'cpu-simulation') {
        renderGanttChart();
      } else if (targetTab === 'algorithm-comparison') {
        runAllComparisons();
      } else if (targetTab === 'simulation-history') {
        fetchHistoryList();
      }
    });
  });
}

function switchTab(tabName) {
  const btn = document.querySelector(`.nav-item[data-tab="${tabName}"]`);
  if (btn) btn.click();
}

function initSystemClock() {
  const clockEl = document.getElementById('system-clock');
  function update() {
    const now = new Date();
    clockEl.textContent = now.toTimeString().split(' ')[0] + ' UTC';
  }
  update();
  setInterval(update, 1000);
}

// ==============================================================
// 2. MATHEMATICAL SCHEDULABILITY & ANALYSIS
// ==============================================================

/**
 * Calculate Greatest Common Divisor (GCD)
 */
function gcd(a, b) {
  return b === 0 ? a : gcd(b, a % b);
}

/**
 * Calculate Least Common Multiple (LCM)
 */
function lcm(a, b) {
  if (a === 0 || b === 0) return 0;
  return Math.abs(a * b) / gcd(a, b);
}

/**
 * Calculate Hyperperiod: LCM of all task periods
 */
function calculateHyperperiod(tasks) {
  if (!tasks || tasks.length === 0) return 1;
  let result = tasks[0].t;
  for (let i = 1; i < tasks.length; i++) {
    result = lcm(result, tasks[i].t);
    // Cap hyperperiod for practical browser visualization safety
    if (result > 600) return 600;
  }
  return result;
}

/**
 * Calculate Total CPU Utilization: U = sum(Ci / Ti)
 */
function calculateTotalUtilization(tasks) {
  if (!tasks || tasks.length === 0) return 0;
  return tasks.reduce((sum, task) => sum + (task.c / task.t), 0);
}

/**
 * Calculate Liu & Layland Schedulability Bound for RMS
 * U_LL(n) = n * (2^(1/n) - 1)
 */
function calculateLiuLaylandBound(n) {
  if (n <= 0) return 1.0;
  return n * (Math.pow(2, 1 / n) - 1);
}

/**
 * Exact Response Time Analysis (RTA) for Rate Monotonic Scheduling
 * Recurrence relation:
 *   R_i^(0) = C_i
 *   R_i^(k+1) = C_i + sum_{j in hp(i)} ceil(R_i^(k) / T_j) * C_j
 * 
 * Iterates until R_i^(k+1) == R_i^(k) (converged) or R_i^(k+1) > D_i (unschedulable).
 */
function performResponseTimeAnalysis(tasks) {
  if (!tasks || tasks.length === 0) return [];

  // Sort tasks in Rate Monotonic Priority order: shorter period = higher priority
  // If periods are equal, lower execution time or ID tie-breaks
  const sorted = [...tasks].sort((a, b) => a.t - b.t || a.c - b.c || a.name.localeCompare(b.name));

  const results = [];

  for (let i = 0; i < sorted.length; i++) {
    const task = sorted[i];
    const higherPriorityTasks = sorted.slice(0, i);

    let R_prev = task.c;
    let iterationSteps = [`R^(0) = ${task.c}`];
    let converged = false;
    let schedulable = true;
    let iterations = 0;
    const MAX_ITERATIONS = 50;

    while (!converged && iterations < MAX_ITERATIONS) {
      iterations++;
      let interference = 0;
      for (const hp of higherPriorityTasks) {
        interference += Math.ceil(R_prev / hp.t) * hp.c;
      }

      const R_next = task.c + interference;
      iterationSteps.push(`R^(${iterations}) = ${R_next}`);

      if (R_next > task.d) {
        schedulable = false;
        R_prev = R_next;
        break;
      }

      if (R_next === R_prev) {
        converged = true;
        break;
      }

      R_prev = R_next;
    }

    results.push({
      priorityRank: i + 1,
      taskName: task.name,
      c: task.c,
      t: task.t,
      d: task.d,
      worstCaseResponseTime: R_prev,
      schedulable: schedulable && R_prev <= task.d,
      iterationStepsText: iterationSteps.join(' &rarr; ')
    });
  }

  return results;
}

/**
 * Evaluate EDF Schedulability
 * For implicit deadlines (D = T): Schedulable <=> U <= 1.0
 * For constrained deadlines (D < T): Density check sum(Ci / min(Di, Ti)) <= 1.0 or Demand Bound Function
 */
function evaluateEDFSchedulability(tasks) {
  if (!tasks || tasks.length === 0) {
    return { schedulable: false, condition: 'No tasks configured' };
  }

  const u = calculateTotalUtilization(tasks);
  const isImplicit = tasks.every(t => t.d === t.t);

  if (isImplicit) {
    return {
      schedulable: u <= 1.000001,
      utilization: u,
      condition: `Implicit Deadlines (Di = Ti): U = ${(u * 100).toFixed(2)}% ${u <= 1 ? '<=' : '>'} 100%`,
      isExact: true
    };
  }

  // Constrained / Arbitrary Deadlines: Density test
  const density = tasks.reduce((sum, t) => sum + (t.c / Math.min(t.d, t.t)), 0);
  return {
    schedulable: density <= 1.000001,
    utilization: u,
    density: density,
    condition: `Constrained Deadlines: Density sum(Ci/min(Di,Ti)) = ${(density * 100).toFixed(2)}%`,
    isExact: false
  };
}

// ==============================================================
// 3. DISCRETE-TIME SIMULATION ENGINE
// ==============================================================

/**
 * Run Discrete-Time Simulation for a given algorithm over a time horizon
 * Algorithms: 'RMS', 'EDF', 'FCFS'
 * 
 * Rules:
 * - Time is discrete: t = 0, 1, 2, ..., horizon
 * - Periodic release: Job released at t if (t - a) >= 0 and (t - a) % t_period == 0
 * - Absolute deadline: d_abs = release_time + d_relative
 * - Ties broken deterministically: RMS by period then ID; EDF by earliest deadline then arrival then ID
 * - RMS and EDF are preemptive; FCFS is non-preemptive
 * - Deadline miss detected if t >= d_abs and remaining_c > 0
 */
function runSimulationEngine(tasks, algorithm = 'RMS', horizon = 20) {
  if (!tasks || tasks.length === 0) {
    return {
      algorithm,
      horizon,
      slices: [],
      jobRecords: [],
      eventLogs: [],
      deadlineMisses: 0,
      completedJobs: 0,
      idleTicks: 0,
      contextSwitches: 0,
      schedulable: true
    };
  }

  // Prepare Task Map & State
  const taskMap = {};
  tasks.forEach((t, index) => {
    taskMap[t.name] = { ...t, colorIndex: index };
  });

  // Ready queue holding active released jobs
  // Job object: { jobId, taskName, releaseTime, cTotal, cRemaining, absDeadline, arrivalTime }
  let readyQueue = [];
  let jobCounter = 0;
  
  const slices = [];          // Contiguous execution blocks: { taskName, startTime, endTime, status, absDeadline }
  const eventLogs = [];       // Step-by-step trace: { time, type, taskName, remaining, absDeadline, details }
  const allJobRecords = [];   // Tracking all released jobs
  
  let currentJob = null;
  let currentSlice = null;
  let deadlineMissCount = 0;
  let completedJobCount = 0;
  let idleTickCount = 0;
  let contextSwitchCount = 0;

  // Discrete time stepping loop
  for (let t = 0; t < horizon; t++) {

    // 1. Check for New Job Releases at time t
    for (const tConfig of tasks) {
      if (t >= tConfig.a && (t - tConfig.a) % tConfig.t === 0) {
        jobCounter++;
        const newJob = {
          jobId: `${tConfig.name}-J${jobCounter}`,
          taskName: tConfig.name,
          releaseTime: t,
          cTotal: tConfig.c,
          cRemaining: tConfig.c,
          absDeadline: t + tConfig.d,
          period: tConfig.t,
          arrivalTime: tConfig.a,
          missed: false,
          completed: false
        };

        readyQueue.push(newJob);
        allJobRecords.push(newJob);

        eventLogs.push({
          time: t,
          type: 'RELEASE',
          taskName: tConfig.name,
          remaining: newJob.cRemaining,
          absDeadline: newJob.absDeadline,
          details: `Job ${newJob.jobId} released. C=${newJob.cTotal}, D_abs=${newJob.absDeadline}`
        });
      }
    }

    // 2. Check for Deadline Misses among all active jobs in ready queue (including currently executing)
    for (const job of readyQueue) {
      if (!job.missed && job.cRemaining > 0 && t >= job.absDeadline) {
        job.missed = true;
        deadlineMissCount++;
        eventLogs.push({
          time: t,
          type: 'DEADLINE_MISS',
          taskName: job.taskName,
          remaining: job.cRemaining,
          absDeadline: job.absDeadline,
          details: `ALERT: Job ${job.jobId} missed its absolute deadline at t=${job.absDeadline}!`
        });
      }
    }

    // 3. Priority Sorting based on Selected Algorithm
    if (algorithm === 'RMS') {
      // Fixed priority: Shorter period T = higher priority
      readyQueue.sort((a, b) => {
        if (a.period !== b.period) return a.period - b.period;
        if (a.releaseTime !== b.releaseTime) return a.releaseTime - b.releaseTime;
        return a.taskName.localeCompare(b.taskName);
      });
    } else if (algorithm === 'EDF') {
      // Dynamic priority: Earliest absolute deadline d_abs = higher priority
      readyQueue.sort((a, b) => {
        if (a.absDeadline !== b.absDeadline) return a.absDeadline - b.absDeadline;
        if (a.period !== b.period) return a.period - b.period;
        return a.taskName.localeCompare(b.taskName);
      });
    } else if (algorithm === 'FCFS') {
      // Non-preemptive First-Come First-Served: Sorted by arrival/release time
      if (!currentJob || currentJob.cRemaining <= 0) {
        readyQueue.sort((a, b) => {
          if (a.releaseTime !== b.releaseTime) return a.releaseTime - b.releaseTime;
          return a.taskName.localeCompare(b.taskName);
        });
      }
    }

    // 4. Scheduling Decision (Preemption check for RMS & EDF)
    let selectedJob = null;
    if (algorithm === 'FCFS') {
      if (currentJob && currentJob.cRemaining > 0) {
        selectedJob = currentJob; // FCFS is non-preemptive
      } else {
        selectedJob = readyQueue[0] || null;
      }
    } else {
      // Preemptive: highest priority job from sorted ready queue
      selectedJob = readyQueue[0] || null;
    }

    // Check Context Switch & Preemption
    if (currentJob && selectedJob && currentJob.jobId !== selectedJob.jobId && currentJob.cRemaining > 0) {
      contextSwitchCount++;
      eventLogs.push({
        time: t,
        type: 'PREEMPTION',
        taskName: selectedJob.taskName,
        remaining: selectedJob.cRemaining,
        absDeadline: selectedJob.absDeadline,
        details: `Task ${selectedJob.taskName} preempts ${currentJob.taskName}`
      });
    }

    // 5. Execute for 1 tick [t, t + 1)
    if (selectedJob) {
      currentJob = selectedJob;
      selectedJob.cRemaining--;

      // Append or extend slice
      if (currentSlice && currentSlice.taskName === selectedJob.taskName && currentSlice.endTime === t) {
        currentSlice.endTime = t + 1;
      } else {
        if (currentSlice) slices.push(currentSlice);
        currentSlice = {
          taskName: selectedJob.taskName,
          jobId: selectedJob.jobId,
          startTime: t,
          endTime: t + 1,
          absDeadline: selectedJob.absDeadline,
          status: 'COMPLETED'
        };
      }

      eventLogs.push({
        time: t,
        type: 'EXECUTE',
        taskName: selectedJob.taskName,
        remaining: selectedJob.cRemaining,
        absDeadline: selectedJob.absDeadline,
        details: `CPU executing ${selectedJob.jobId} (Remaining: ${selectedJob.cRemaining})`
      });

      // 6. Check Job Completion
      if (selectedJob.cRemaining === 0) {
        selectedJob.completed = true;
        completedJobCount++;
        readyQueue = readyQueue.filter(j => j.jobId !== selectedJob.jobId);
        
        eventLogs.push({
          time: t + 1,
          type: 'COMPLETION',
          taskName: selectedJob.taskName,
          remaining: 0,
          absDeadline: selectedJob.absDeadline,
          details: `Job ${selectedJob.jobId} finished execution at t=${t + 1}`
        });

        currentJob = null;
      }
    } else {
      // CPU Idle tick
      idleTickCount++;
      currentJob = null;
      
      if (currentSlice && currentSlice.taskName === 'IDLE' && currentSlice.endTime === t) {
        currentSlice.endTime = t + 1;
      } else {
        if (currentSlice) slices.push(currentSlice);
        currentSlice = {
          taskName: 'IDLE',
          jobId: 'IDLE',
          startTime: t,
          endTime: t + 1,
          absDeadline: 0,
          status: 'IDLE'
        };
      }

      eventLogs.push({
        time: t,
        type: 'IDLE',
        taskName: 'CPU',
        remaining: 0,
        absDeadline: 0,
        details: `CPU is IDLE [t=${t} to t=${t + 1}]`
      });
    }
  }

  // Push final slice if present
  if (currentSlice) {
    slices.push(currentSlice);
  }

  return {
    algorithm,
    horizon,
    slices,
    jobRecords: allJobRecords,
    eventLogs,
    deadlineMisses: deadlineMissCount,
    completedJobs: completedJobCount,
    idleTicks: idleTickCount,
    contextSwitches: contextSwitchCount,
    schedulable: deadlineMissCount === 0
  };
}

// ==============================================================
// 4. HTML5 CANVAS GANTT CHART RENDERER
// ==============================================================

/**
 * Render Interactive Gantt Timeline onto HTML5 Canvas
 */
function renderGanttChart() {
  const canvas = document.getElementById('ganttCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const simResult = state.simResult;
  if (!simResult) return;

  const tasks = state.tasks;
  const horizon = simResult.horizon || 20;

  // Layout Metrics
  const dpr = window.devicePixelRatio || 1;
  const rowHeight = 44;
  const headerHeight = 55;
  const leftPadding = 90; // Space for Task Labels on Y-axis
  const rightPadding = 40;
  
  // Total canvas height based on task count + 1 for Unified CPU line
  const totalRows = tasks.length + 1;
  const computedHeight = headerHeight + (totalRows * rowHeight) + 30;
  
  // Scale width dynamically if horizon is large
  const minWidthPerTick = 42;
  const computedWidth = Math.max(980, leftPadding + rightPadding + (horizon * minWidthPerTick));

  // Set internal buffer size for high-DPI crisp rendering
  canvas.width = computedWidth * dpr;
  canvas.height = computedHeight * dpr;
  canvas.style.width = `${computedWidth}px`;
  canvas.style.height = `${computedHeight}px`;

  ctx.scale(dpr, dpr);

  // Clear Canvas Background (Dark Navy)
  ctx.fillStyle = '#070b14';
  ctx.fillRect(0, 0, computedWidth, computedHeight);

  const chartWidth = computedWidth - leftPadding - rightPadding;
  const tickWidth = chartWidth / horizon;

  // 1. Draw Time Axis and Vertical Grid Lines
  ctx.font = '11px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';

  for (let t = 0; t <= horizon; t++) {
    const x = leftPadding + (t * tickWidth);

    // Vertical grid line
    ctx.strokeStyle = t % 5 === 0 ? '#223253' : '#141d33';
    ctx.lineWidth = t % 5 === 0 ? 1.5 : 1;
    ctx.beginPath();
    ctx.moveTo(x, 20);
    ctx.lineTo(x, computedHeight - 15);
    ctx.stroke();

    // Time Label Number
    ctx.fillStyle = t % 5 === 0 ? '#38bdf8' : '#64748b';
    ctx.fillText(t.toString(), x, 18);
  }

  // 2. Row 0: Unified CPU State Timeline
  const cpuY = headerHeight;
  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 12px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('CPU ALL', leftPadding - 12, cpuY + (rowHeight / 2) + 4);

  // CPU Row Track
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(leftPadding, cpuY, chartWidth, rowHeight - 8);
  ctx.strokeStyle = '#1e293b';
  ctx.strokeRect(leftPadding, cpuY, chartWidth, rowHeight - 8);

  // Render unified execution slices on CPU line
  for (const slice of simResult.slices) {
    if (slice.startTime >= horizon) continue;
    const end = Math.min(slice.endTime, horizon);
    const startX = leftPadding + (slice.startTime * tickWidth);
    const sliceWidth = (end - slice.startTime) * tickWidth;

    if (slice.taskName === 'IDLE') {
      // Draw Idle pattern
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(startX, cpuY, sliceWidth, rowHeight - 8);
      ctx.fillStyle = '#64748b';
      ctx.font = '11px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      if (sliceWidth > 24) {
        ctx.fillText('IDLE', startX + (sliceWidth / 2), cpuY + (rowHeight / 2) + 1);
      }
    } else {
      const taskIndex = tasks.findIndex(t => t.name === slice.taskName);
      const color = getTaskColor(taskIndex >= 0 ? taskIndex : 0);
      
      ctx.fillStyle = color;
      ctx.fillRect(startX, cpuY, sliceWidth, rowHeight - 8);

      // Inner border
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 1;
      ctx.strokeRect(startX, cpuY, sliceWidth, rowHeight - 8);

      // Label inside slice
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      if (sliceWidth >= 20) {
        ctx.fillText(slice.taskName, startX + (sliceWidth / 2), cpuY + (rowHeight / 2) + 1);
      }
    }
  }

  // 3. Individual Task Rows
  tasks.forEach((task, index) => {
    const rowY = headerHeight + ((index + 1) * rowHeight);
    const taskColor = getTaskColor(index);

    // Row Label
    ctx.fillStyle = '#cbd5e1';
    ctx.font = 'bold 12px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${task.name} (T=${task.t})`, leftPadding - 12, rowY + (rowHeight / 2) + 4);

    // Row Track
    ctx.fillStyle = '#0a101f';
    ctx.fillRect(leftPadding, rowY, chartWidth, rowHeight - 10);
    ctx.strokeStyle = '#18243f';
    ctx.strokeRect(leftPadding, rowY, chartWidth, rowHeight - 10);

    // Render Execution Slices for this specific task
    for (const slice of simResult.slices) {
      if (slice.taskName === task.name) {
        if (slice.startTime >= horizon) continue;
        const end = Math.min(slice.endTime, horizon);
        const startX = leftPadding + (slice.startTime * tickWidth);
        const sliceWidth = (end - slice.startTime) * tickWidth;

        // Block fill
        ctx.fillStyle = taskColor;
        ctx.fillRect(startX, rowY, sliceWidth, rowHeight - 10);

        // Highlight border
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.strokeRect(startX, rowY, sliceWidth, rowHeight - 10);

        // Text
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 11px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        if (sliceWidth >= 20) {
          ctx.fillText(task.name, startX + (sliceWidth / 2), rowY + (rowHeight / 2) + 1);
        }
      }
    }

    // 4. Draw Release Markers (Down Arrow v) and Deadline Markers (Dagger / Flag)
    // Periodic releases: r = a + k * T
    let k = 0;
    while (true) {
      const releaseTime = task.a + (k * task.t);
      if (releaseTime > horizon) break;

      const releaseX = leftPadding + (releaseTime * tickWidth);

      // Release Arrow (Pointing down)
      ctx.strokeStyle = '#38bdf8';
      ctx.fillStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(releaseX, rowY - 6);
      ctx.lineTo(releaseX, rowY + 6);
      ctx.lineTo(releaseX - 4, rowY);
      ctx.moveTo(releaseX, rowY + 6);
      ctx.lineTo(releaseX + 4, rowY);
      ctx.stroke();

      // Absolute Deadline Marker: d_abs = releaseTime + task.d
      const deadlineTime = releaseTime + task.d;
      if (deadlineTime <= horizon) {
        const deadlineX = leftPadding + (deadlineTime * tickWidth);
        ctx.strokeStyle = '#f59e0b';
        ctx.fillStyle = '#f59e0b';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(deadlineX, rowY - 4);
        ctx.lineTo(deadlineX, rowY + rowHeight - 6);
        ctx.stroke();

        // Little deadline flag cap
        ctx.beginPath();
        ctx.moveTo(deadlineX, rowY - 4);
        ctx.lineTo(deadlineX + 5, rowY - 1);
        ctx.lineTo(deadlineX, rowY + 2);
        ctx.fill();
      }

      k++;
    }
  });

  // 5. Render Deadline Miss Warning Badges
  for (const job of simResult.jobRecords) {
    if (job.missed && job.absDeadline <= horizon) {
      const taskIndex = tasks.findIndex(t => t.name === job.taskName);
      if (taskIndex >= 0) {
        const rowY = headerHeight + ((taskIndex + 1) * rowHeight);
        const missX = leftPadding + (job.absDeadline * tickWidth);

        // Red cross badge
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(missX, rowY + (rowHeight / 2) - 5, 8, 0, 2 * Math.PI);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('X', missX, rowY + (rowHeight / 2) - 1);
      }
    }
  }

  // 6. Draw Current Playback Scrubber Line
  if (state.playbackTime <= horizon) {
    const scrubberX = leftPadding + (state.playbackTime * tickWidth);
    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([4, 2]);
    ctx.beginPath();
    ctx.moveTo(scrubberX, 22);
    ctx.lineTo(scrubberX, computedHeight - 15);
    ctx.stroke();
    ctx.setLineDash([]); // Reset line dash

    // Playhead head icon
    ctx.fillStyle = '#06b6d4';
    ctx.beginPath();
    ctx.moveTo(scrubberX - 6, 22);
    ctx.lineTo(scrubberX + 6, 22);
    ctx.lineTo(scrubberX, 32);
    ctx.fill();
  }
}

/**
 * Update the Gantt Legend Bar with dynamically colored task chips
 */
function updateGanttLegend() {
  const container = document.getElementById('gantt-legend');
  if (!container) return;

  let html = `
    <div class="legend-item">
      <div class="legend-color-box" style="background-color: #1e293b; border: 1px dashed #64748b;"></div>
      <span>CPU Idle</span>
    </div>
  `;

  state.tasks.forEach((t, index) => {
    const color = getTaskColor(index);
    html += `
      <div class="legend-item">
        <div class="legend-color-box" style="background-color: ${color};"></div>
        <span>${t.name} (C=${t.c}, T=${t.t}, D=${t.d})</span>
      </div>
    `;
  });

  html += `
    <div class="legend-item">
      <span style="color: #38bdf8; font-weight: bold;">&darr;</span>
      <span>Release Point</span>
    </div>
    <div class="legend-item">
      <span style="color: #f59e0b; font-weight: bold;">&#124;</span>
      <span>Deadline</span>
    </div>
    <div class="legend-item">
      <span style="color: #ef4444; font-weight: bold;">&#10006;</span>
      <span>Deadline Miss</span>
    </div>
  `;

  container.innerHTML = html;
}

// ==============================================================
// 5. GANTT PLAYBACK CONTROLLER
// ==============================================================

function initSimulationEvents() {
  const btnRun = document.getElementById('btn-run-simulation');
  const btnSave = document.getElementById('btn-save-simulation');
  const btnPlayPause = document.getElementById('btn-play-pause');
  const btnStep = document.getElementById('btn-step-forward');
  const btnReset = document.getElementById('btn-reset-playback');
  const speedSelect = document.getElementById('playback-speed-select');
  const algoSelect = document.getElementById('sim-algo-select');
  const horizonInput = document.getElementById('sim-horizon-input');
  const btnSetHyperperiod = document.getElementById('btn-set-hyperperiod');

  // Change algorithm
  algoSelect.addEventListener('change', (e) => {
    state.currentAlgo = e.target.value;
    runActiveSimulation();
  });

  // Change horizon
  horizonInput.addEventListener('change', (e) => {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val) && val >= 5 && val <= 300) {
      state.simulationHorizon = val;
      runActiveSimulation();
    }
  });

  // Set to Hyperperiod
  btnSetHyperperiod.addEventListener('click', () => {
    const hp = calculateHyperperiod(state.tasks);
    horizonInput.value = hp;
    state.simulationHorizon = hp;
    runActiveSimulation();
    showToast(`Set horizon to Hyperperiod LCM: ${hp} ticks`, 'info');
  });

  // Run simulation button
  btnRun.addEventListener('click', () => {
    runActiveSimulation();
    showToast(`Executed ${state.currentAlgo} simulation over ${state.simulationHorizon} ticks`, 'info');
  });

  // Save simulation to MySQL
  btnSave.addEventListener('click', () => {
    saveCurrentSimulationToBackend();
  });

  // Play / Pause
  btnPlayPause.addEventListener('click', togglePlayback);

  // Step Forward
  btnStep.addEventListener('click', () => {
    pausePlayback();
    if (state.playbackTime < state.simulationHorizon) {
      state.playbackTime++;
      updateLiveTelemetry();
      renderGanttChart();
    }
  });

  // Reset
  btnReset.addEventListener('click', () => {
    pausePlayback();
    state.playbackTime = 0;
    updateLiveTelemetry();
    renderGanttChart();
  });

  // Speed selection
  speedSelect.addEventListener('change', (e) => {
    state.playbackSpeedMs = parseInt(e.target.value, 10);
    if (state.isPlaying) {
      pausePlayback();
      startPlayback();
    }
  });
}

function runActiveSimulation() {
  pausePlayback();
  state.playbackTime = 0;
  state.simResult = runSimulationEngine(state.tasks, state.currentAlgo, state.simulationHorizon);
  
  // Update header text
  document.getElementById('gantt-title').textContent = `CPU Execution Timeline (${state.currentAlgo})`;
  document.getElementById('gantt-subtitle').textContent = `Algorithm: ${state.currentAlgo} | Horizon: 0 to ${state.simulationHorizon} ticks | Deadlines Missed: ${state.simResult.deadlineMisses}`;

  updateGanttLegend();
  renderGanttChart();
  updateLiveTelemetry();
  renderEventLogTable();
}

function togglePlayback() {
  if (state.isPlaying) {
    pausePlayback();
  } else {
    startPlayback();
  }
}

function startPlayback() {
  state.isPlaying = true;
  document.getElementById('icon-play').classList.add('hidden');
  document.getElementById('icon-pause').classList.remove('hidden');

  if (state.playbackTime >= state.simulationHorizon) {
    state.playbackTime = 0;
  }

  state.timerId = setInterval(() => {
    if (state.playbackTime < state.simulationHorizon) {
      state.playbackTime++;
      updateLiveTelemetry();
      renderGanttChart();
    } else {
      pausePlayback();
    }
  }, state.playbackSpeedMs);
}

function pausePlayback() {
  state.isPlaying = false;
  if (state.timerId) {
    clearInterval(state.timerId);
    state.timerId = null;
  }
  document.getElementById('icon-play').classList.remove('hidden');
  document.getElementById('icon-pause').classList.add('hidden');
}

/**
 * Update the bottom live telemetry values based on playback scrubber time t
 */
function updateLiveTelemetry() {
  const t = state.playbackTime;
  const sim = state.simResult;
  if (!sim) return;

  document.getElementById('live-time-val').textContent = t;

  // Find what was executing at time t (slice starting <= t and ending > t)
  const activeSlice = sim.slices.find(s => s.startTime <= t && s.endTime > t);
  const cpuStateEl = document.getElementById('live-cpu-state');
  if (activeSlice) {
    if (activeSlice.taskName === 'IDLE') {
      cpuStateEl.textContent = 'IDLE (No active task)';
      cpuStateEl.style.color = '#94a3b8';
    } else {
      cpuStateEl.textContent = `Executing ${activeSlice.taskName} [${activeSlice.jobId || ''}]`;
      cpuStateEl.style.color = '#06b6d4';
    }
  } else {
    cpuStateEl.textContent = 'Completed Horizon';
    cpuStateEl.style.color = '#94a3b8';
  }

  // Preemptions and misses up to time t
  const missesUpToT = sim.eventLogs.filter(e => e.type === 'DEADLINE_MISS' && e.time <= t).length;
  const preemptionsUpToT = sim.eventLogs.filter(e => e.type === 'PREEMPTION' && e.time <= t).length;

  document.getElementById('live-deadline-misses').textContent = missesUpToT;
  document.getElementById('live-preemptions').textContent = preemptionsUpToT;

  // Active Ready Queue at time t
  const activeJobs = sim.jobRecords.filter(j => j.releaseTime <= t && (!j.completed || (j.releaseTime + j.cTotal > t)));
  const readyQueueEl = document.getElementById('live-ready-queue');
  if (activeJobs.length === 0) {
    readyQueueEl.textContent = '[ Empty ]';
  } else {
    readyQueueEl.textContent = activeJobs.map(j => j.taskName).join(', ');
  }
}

/**
 * Render the Discrete Event Log Table
 */
function renderEventLogTable() {
  const tbody = document.getElementById('tbody-event-log');
  if (!tbody || !state.simResult) return;

  const logs = state.simResult.eventLogs;
  if (logs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No simulation events recorded.</td></tr>';
    return;
  }

  let html = '';
  for (const log of logs) {
    let badgeClass = 'badge-info';
    if (log.type === 'DEADLINE_MISS') badgeClass = 'badge-danger';
    else if (log.type === 'COMPLETION') badgeClass = 'badge-success';
    else if (log.type === 'PREEMPTION') badgeClass = 'badge-warning';
    else if (log.type === 'IDLE') badgeClass = 'badge-secondary';

    html += `
      <tr>
        <td><strong>t = ${log.time}</strong></td>
        <td><span class="badge ${badgeClass}">${log.type}</span></td>
        <td><strong>${log.taskName}</strong></td>
        <td>${log.remaining}</td>
        <td>${log.absDeadline || '-'}</td>
        <td>${log.details}</td>
      </tr>
    `;
  }

  tbody.innerHTML = html;
}

// ==============================================================
// 6. TASK CONFIGURATION MANAGEMENT
// ==============================================================

function initTaskConfigEvents() {
  const btnOpenAdd = document.getElementById('btn-open-add-task');
  const btnResetSample = document.getElementById('btn-load-sample-tasks');
  const btnClearAll = document.getElementById('btn-clear-all-tasks');
  const formTask = document.getElementById('form-task');
  const btnCloseModal = document.getElementById('btn-close-task-modal');
  const btnCancelModal = document.getElementById('btn-cancel-task-modal');

  btnOpenAdd.addEventListener('click', () => openTaskModal());
  btnResetSample.addEventListener('click', () => {
    loadSampleTaskSet();
    showToast('Reset task configuration to sample set.', 'info');
  });
  btnClearAll.addEventListener('click', () => {
    if (confirm('Are you sure you want to clear all tasks?')) {
      state.tasks = [];
      recalculateAll();
      showToast('All tasks cleared.', 'warning');
    }
  });

  btnCloseModal.addEventListener('click', closeTaskModal);
  btnCancelModal.addEventListener('click', closeTaskModal);

  formTask.addEventListener('submit', (e) => {
    e.preventDefault();
    handleTaskFormSubmit();
  });
}

function openTaskModal(editIndex = -1) {
  const modal = document.getElementById('modal-task-form');
  const title = document.getElementById('task-modal-title');
  const editIndexInput = document.getElementById('task-edit-index');
  const errorMsg = document.getElementById('task-form-error');
  errorMsg.classList.add('hidden');

  if (editIndex >= 0 && editIndex < state.tasks.length) {
    const t = state.tasks[editIndex];
    title.textContent = `Edit Task ${t.name}`;
    editIndexInput.value = editIndex;
    document.getElementById('input-task-name').value = t.name;
    document.getElementById('input-task-c').value = t.c;
    document.getElementById('input-task-t').value = t.t;
    document.getElementById('input-task-d').value = t.d;
    document.getElementById('input-task-a').value = t.a;
  } else {
    title.textContent = 'Add Periodic Task';
    editIndexInput.value = -1;
    document.getElementById('input-task-name').value = `T${state.tasks.length + 1}`;
    document.getElementById('input-task-c').value = '1';
    document.getElementById('input-task-t').value = '5';
    document.getElementById('input-task-d').value = '5';
    document.getElementById('input-task-a').value = '0';
  }

  modal.classList.remove('hidden');
}

function closeTaskModal() {
  document.getElementById('modal-task-form').classList.add('hidden');
}

function handleTaskFormSubmit() {
  const errorMsg = document.getElementById('task-form-error');
  const editIndex = parseInt(document.getElementById('task-edit-index').value, 10);
  
  const name = document.getElementById('input-task-name').value.trim();
  const c = parseInt(document.getElementById('input-task-c').value, 10);
  const t = parseInt(document.getElementById('input-task-t').value, 10);
  const d = parseInt(document.getElementById('input-task-d').value, 10);
  const a = parseInt(document.getElementById('input-task-a').value, 10);

  // Validations
  if (!name) {
    showFormError('Task Name/ID is required.');
    return;
  }

  // Duplicate name check
  const duplicate = state.tasks.some((task, i) => task.name.toLowerCase() === name.toLowerCase() && i !== editIndex);
  if (duplicate) {
    showFormError(`A task with the ID '${name}' already exists.`);
    return;
  }

  if (isNaN(c) || c <= 0) {
    showFormError('Execution Time (C) must be a positive integer >= 1.');
    return;
  }

  if (isNaN(t) || t <= 0) {
    showFormError('Period (T) must be a positive integer >= 1.');
    return;
  }

  if (isNaN(d) || d <= 0) {
    showFormError('Deadline (D) must be a positive integer >= 1.');
    return;
  }

  if (c > d) {
    showFormError('Execution time (C) cannot exceed relative deadline (D).');
    return;
  }

  if (isNaN(a) || a < 0) {
    showFormError('Arrival time (A) must be >= 0.');
    return;
  }

  const taskObj = { id: name, name, c, t, d, a };

  if (editIndex >= 0) {
    state.tasks[editIndex] = taskObj;
    showToast(`Updated task ${name}`, 'success');
  } else {
    state.tasks.push(taskObj);
    showToast(`Added task ${name}`, 'success');
  }

  closeTaskModal();
  recalculateAll();
}

function showFormError(msg) {
  const errorEl = document.getElementById('task-form-error');
  errorEl.textContent = msg;
  errorEl.classList.remove('hidden');
}

function loadSampleTaskSet() {
  state.tasks = [
    { id: 'T1', name: 'T1', c: 1, t: 4, d: 4, a: 0 },
    { id: 'T2', name: 'T2', c: 2, t: 5, d: 5, a: 0 },
    { id: 'T3', name: 'T3', c: 1, t: 10, d: 10, a: 0 },
    { id: 'T4', name: 'T4', c: 2, t: 20, d: 20, a: 0 }
  ];
  state.simulationHorizon = 20;
  document.getElementById('sim-horizon-input').value = '20';
  recalculateAll();
}

function deleteTask(index) {
  if (index >= 0 && index < state.tasks.length) {
    const deletedName = state.tasks[index].name;
    state.tasks.splice(index, 1);
    recalculateAll();
    showToast(`Deleted task ${deletedName}`, 'info');
  }
}

/**
 * Render Task Configuration Table
 */
function renderTaskTable() {
  const tbody = document.getElementById('tbody-tasks');
  if (!tbody) return;

  if (state.tasks.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="text-center text-muted">No tasks configured. Click "Add Task" or "Reset to Sample Set" to begin.</td>
      </tr>
    `;
    document.getElementById('tfoot-total-c').textContent = '0';
    document.getElementById('tfoot-total-u').textContent = '0.0%';
    return;
  }

  // Sort by Rate Monotonic Priority for clear visualization
  const sortedTasks = [...state.tasks].sort((a, b) => a.t - b.t);

  let totalC = 0;
  let html = '';

  state.tasks.forEach((task, index) => {
    totalC += task.c;
    const uPercent = ((task.c / task.t) * 100).toFixed(1);
    const rmRank = sortedTasks.findIndex(st => st.name === task.name) + 1;

    html += `
      <tr>
        <td><strong>${task.name}</strong></td>
        <td>${task.c} ticks</td>
        <td>${task.t} ticks</td>
        <td>${task.d} ticks</td>
        <td>t = ${task.a}</td>
        <td><code>${task.c}/${task.t} (${uPercent}%)</code></td>
        <td><span class="badge badge-info">Priority ${rmRank}</span></td>
        <td>
          <button class="btn btn-secondary btn-xs" onclick="openTaskModal(${index})">Edit</button>
          <button class="btn btn-danger btn-xs" onclick="deleteTask(${index})">Delete</button>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;

  const totalU = calculateTotalUtilization(state.tasks);
  document.getElementById('tfoot-total-c').textContent = `${totalC} ticks`;
  document.getElementById('tfoot-total-u').innerHTML = `<strong>${(totalU * 100).toFixed(1)}%</strong>`;
  
  const badge = document.getElementById('tfoot-feasibility-badge');
  if (totalU <= 1.0) {
    badge.className = 'badge badge-success';
    badge.textContent = 'FEASIBLE (U <= 100%)';
  } else {
    badge.className = 'badge badge-danger';
    badge.textContent = 'OVERLOADED (U > 100%)';
  }

  // Update Config Tab specs
  document.getElementById('cfg-task-count').textContent = state.tasks.length;
  document.getElementById('cfg-total-u').textContent = `${(totalU * 100).toFixed(2)}%`;
  document.getElementById('cfg-hyperperiod').textContent = `${calculateHyperperiod(state.tasks)} ticks`;
  
  const allImplicit = state.tasks.every(t => t.d === t.t);
  document.getElementById('cfg-deadline-model').textContent = allImplicit 
    ? 'Implicit Deadlines (Di = Ti)' 
    : 'Constrained / Arbitrary Deadlines';
}

// ==============================================================
// 7. SCHEDULABILITY ANALYSIS & REPORTING
// ==============================================================

function initSchedulabilityEvents() {
  // Navigation shortcuts from dashboard
  document.getElementById('dash-btn-run-rms').addEventListener('click', () => {
    state.currentAlgo = 'RMS';
    document.getElementById('sim-algo-select').value = 'RMS';
    switchTab('cpu-simulation');
    runActiveSimulation();
  });

  document.getElementById('dash-btn-run-edf').addEventListener('click', () => {
    state.currentAlgo = 'EDF';
    document.getElementById('sim-algo-select').value = 'EDF';
    switchTab('cpu-simulation');
    runActiveSimulation();
  });

  document.getElementById('dash-btn-compare').addEventListener('click', () => {
    switchTab('algorithm-comparison');
  });

  document.getElementById('dash-btn-configure').addEventListener('click', () => {
    switchTab('task-config');
  });
}

/**
 * Recalculate Schedulability Metrics, Update Dashboard and RTA Table
 */
function recalculateAll() {
  const tasks = state.tasks;
  const n = tasks.length;
  const totalU = calculateTotalUtilization(tasks);
  const hyperperiod = calculateHyperperiod(tasks);
  const llBound = calculateLiuLaylandBound(n);
  const rtaResults = performResponseTimeAnalysis(tasks);
  const edfResult = evaluateEDFSchedulability(tasks);

  const allRtaPassed = rtaResults.length > 0 && rtaResults.every(r => r.schedulable);

  // 1. Update Dashboard Metric Cards
  document.getElementById('dash-total-tasks').textContent = n;
  document.getElementById('dash-utilization').textContent = `${(totalU * 100).toFixed(1)}%`;
  
  // Progress bar
  const barFill = document.getElementById('utilization-bar-fill');
  const barWidth = Math.min(totalU * 100, 100);
  barFill.style.width = `${barWidth}%`;
  if (totalU > 1.0) {
    barFill.classList.add('overload');
  } else {
    barFill.classList.remove('overload');
  }
  document.getElementById('progress-util-text').textContent = `${(totalU * 100).toFixed(1)}%`;

  // LL Bound Marker on Dashboard Bar
  const llMarker = document.getElementById('ll-bound-marker');
  const llPercent = (llBound * 100).toFixed(1);
  llMarker.style.left = `${Math.min(llPercent, 100)}%`;
  llMarker.title = `Liu-Layland Bound (${llPercent}%)`;
  llMarker.querySelector('.bound-label').textContent = `LL Bound (${llPercent}%)`;

  // RMS Status
  const rmsStatusEl = document.getElementById('dash-rms-status');
  const rmsSubEl = document.getElementById('dash-rms-sub');
  if (allRtaPassed) {
    rmsStatusEl.textContent = 'SCHEDULABLE';
    rmsStatusEl.className = 'stat-value status-text-schedulable';
    rmsSubEl.textContent = 'Passes Exact Response Time Analysis';
  } else {
    rmsStatusEl.textContent = 'UNSCHEDULABLE';
    rmsStatusEl.className = 'stat-value status-text-unschedulable';
    rmsSubEl.textContent = 'Exceeds Deadline in RTA';
  }

  // EDF Status
  const edfStatusEl = document.getElementById('dash-edf-status');
  const edfSubEl = document.getElementById('dash-edf-sub');
  if (edfResult.schedulable) {
    edfStatusEl.textContent = 'SCHEDULABLE';
    edfStatusEl.className = 'stat-value status-text-schedulable';
    edfSubEl.textContent = `U = ${(totalU * 100).toFixed(1)}% <= 100%`;
  } else {
    edfStatusEl.textContent = 'UNSCHEDULABLE';
    edfStatusEl.className = 'stat-value status-text-unschedulable';
    edfSubEl.textContent = `Overload: ${(totalU * 100).toFixed(1)}% > 100%`;
  }

  // Dashboard Specs
  document.getElementById('dash-hyperperiod').textContent = `${hyperperiod} ticks`;
  document.getElementById('dash-ll-bound').textContent = `${(llBound * 100).toFixed(2)}% (n = ${n})`;
  document.getElementById('dash-rta-verdict').textContent = allRtaPassed 
    ? 'All Tasks R_i <= D_i (Schedulable)' 
    : 'One or more tasks violate deadline (Unschedulable)';
  document.getElementById('dash-rta-verdict').className = allRtaPassed 
    ? 'spec-val color-schedulable' 
    : 'spec-val color-unschedulable';
  
  document.getElementById('dash-edf-verdict').textContent = edfResult.schedulable
    ? `U = ${(totalU).toFixed(3)} <= 1.000 (Schedulable)`
    : `U = ${(totalU).toFixed(3)} > 1.000 (Unschedulable)`;
  document.getElementById('dash-edf-verdict').className = edfResult.schedulable
    ? 'spec-val color-schedulable' 
    : 'spec-val color-unschedulable';

  // 2. Update Schedulability Analysis View
  document.getElementById('test-u-val').textContent = `U = ${totalU.toFixed(3)} (${(totalU * 100).toFixed(1)}%)`;
  const testUStatus = document.getElementById('test-u-status');
  if (totalU <= 1.0) {
    testUStatus.innerHTML = '<span class="badge badge-success">&le; 100% (Necessary Condition Met)</span>';
  } else {
    testUStatus.innerHTML = '<span class="badge badge-danger">&gt; 100% (CPU Overload - Infeasible)</span>';
  }

  document.getElementById('test-ll-val').textContent = `U_LL(${n}) = ${(llBound * 100).toFixed(2)}%`;
  const testLLStatus = document.getElementById('test-ll-status');
  if (totalU <= llBound) {
    testLLStatus.innerHTML = '<span class="badge badge-success">U &le; U_LL (Guaranteed Schedulable)</span>';
  } else {
    testLLStatus.innerHTML = '<span class="badge badge-warning">U &gt; U_LL (Inconclusive - RTA Required)</span>';
  }

  document.getElementById('test-edf-val').textContent = `${(totalU * 100).toFixed(1)}% ${totalU <= 1 ? '<=' : '>'} 100.0%`;
  const testEDFStatus = document.getElementById('test-edf-status');
  if (edfResult.schedulable) {
    testEDFStatus.innerHTML = '<span class="badge badge-success">Guaranteed Schedulable</span>';
  } else {
    testEDFStatus.innerHTML = '<span class="badge badge-danger">Unschedulable</span>';
  }

  // 3. Render RTA Recurrence Iteration Table
  renderRtaTable(rtaResults);

  // 4. Update Task Table
  renderTaskTable();

  // 5. Re-run active simulation
  runActiveSimulation();
}

/**
 * Render Step-by-Step Response Time Analysis (RTA) Iteration Table
 */
function renderRtaTable(rtaResults) {
  const tbody = document.getElementById('tbody-rta');
  const banner = document.getElementById('rta-summary-banner');
  if (!tbody) return;

  if (rtaResults.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">No tasks available for Response Time Analysis.</td></tr>';
    banner.textContent = 'Configure tasks to view RTA convergence steps.';
    return;
  }

  let html = '';
  let allPassed = true;

  for (const row of rtaResults) {
    if (!row.schedulable) allPassed = false;
    html += `
      <tr>
        <td><span class="badge badge-info">Rank ${row.priorityRank}</span></td>
        <td><strong>${row.taskName}</strong></td>
        <td>${row.c}</td>
        <td>${row.t}</td>
        <td>${row.d}</td>
        <td><code class="text-info">${row.iterationStepsText}</code></td>
        <td><strong>${row.worstCaseResponseTime} ticks</strong></td>
        <td>
          <span class="badge ${row.schedulable ? 'badge-success' : 'badge-danger'}">
            ${row.schedulable ? 'SCHEDULABLE (R <= D)' : 'DEADLINE VIOLATION'}
          </span>
        </td>
      </tr>
    `;
  }

  tbody.innerHTML = html;

  if (allPassed) {
    banner.className = 'rta-summary-banner';
    banner.innerHTML = `<strong>RTA Conclusion:</strong> All ${rtaResults.length} tasks satisfy \\(R_i \\le D_i\\). Despite system utilization of ${(calculateTotalUtilization(state.tasks) * 100).toFixed(1)}%, the task set is <strong>100% Schedulable under RMS</strong>!`;
  } else {
    banner.className = 'rta-summary-banner';
    banner.style.backgroundColor = 'var(--status-danger-bg)';
    banner.style.borderColor = 'rgba(239, 68, 68, 0.4)';
    banner.innerHTML = `<strong>RTA Conclusion:</strong> One or more tasks experience worst-case response times exceeding their deadlines (\\(R_i > D_i\\)). The task set is <strong>UNSCHEDULABLE under RMS</strong> without priority adjustment.`;
  }
}

// ==============================================================
// 8. MULTI-ALGORITHM BENCHMARK & COMPARISON
// ==============================================================

function initComparisonEvents() {
  document.getElementById('btn-run-all-comparisons').addEventListener('click', () => {
    runAllComparisons();
    showToast('Executed RMS, EDF, and FCFS comparative benchmarks.', 'info');
  });
}

function runAllComparisons() {
  const tasks = state.tasks;
  const horizon = state.simulationHorizon || 20;

  const rmsResult = runSimulationEngine(tasks, 'RMS', horizon);
  const edfResult = runSimulationEngine(tasks, 'EDF', horizon);
  const fcfsResult = runSimulationEngine(tasks, 'FCFS', horizon);

  const algorithms = [
    { name: 'RMS (Rate Monotonic)', type: 'Static Priority', result: rmsResult },
    { name: 'EDF (Earliest Deadline First)', type: 'Dynamic Priority', result: edfResult },
    { name: 'FCFS (First-Come First-Served)', type: 'Non-Preemptive', result: fcfsResult }
  ];

  const tbody = document.getElementById('tbody-comparison');
  let tableHtml = '';
  const totalUPercent = (calculateTotalUtilization(tasks) * 100).toFixed(1);

  algorithms.forEach(algo => {
    const res = algo.result;
    const isSchedulable = res.deadlineMisses === 0;
    
    // Efficiency score formula: (Completed Jobs / (Completed Jobs + Deadline Misses)) * 100
    const totalJobs = res.completedJobs + res.deadlineMisses;
    const effScore = totalJobs > 0 ? ((res.completedJobs / totalJobs) * 100).toFixed(1) : '100.0';

    tableHtml += `
      <tr>
        <td><strong>${algo.name}</strong></td>
        <td><span class="badge badge-info">${algo.type}</span></td>
        <td>
          <span class="badge ${isSchedulable ? 'badge-success' : 'badge-danger'}">
            ${isSchedulable ? 'FEASIBLE' : 'MISSED DEADLINES'}
          </span>
        </td>
        <td>${totalUPercent}%</td>
        <td><strong>${res.completedJobs}</strong></td>
        <td class="${res.deadlineMisses > 0 ? 'text-danger font-weight-bold' : ''}">${res.deadlineMisses}</td>
        <td>${res.contextSwitches}</td>
        <td>${res.idleTicks} ticks</td>
        <td><strong>${effScore}%</strong></td>
      </tr>
    `;
  });

  tbody.innerHTML = tableHtml;

  // Render Visual Benchmark Bars
  renderBenchmarkCharts(algorithms);
}

function renderBenchmarkCharts(algorithms) {
  const jobsChart = document.getElementById('benchmark-jobs-chart');
  const switchesChart = document.getElementById('benchmark-switches-chart');
  if (!jobsChart || !switchesChart) return;

  let jobsHtml = '';
  let switchesHtml = '';

  const maxJobs = Math.max(...algorithms.map(a => a.result.completedJobs + a.result.deadlineMisses), 1);
  const maxSwitches = Math.max(...algorithms.map(a => a.result.contextSwitches), 1);

  algorithms.forEach(a => {
    const r = a.result;
    const completedPct = ((r.completedJobs / maxJobs) * 100).toFixed(1);
    const missedPct = ((r.deadlineMisses / maxJobs) * 100).toFixed(1);
    const switchesPct = ((r.contextSwitches / maxSwitches) * 100).toFixed(1);

    jobsHtml += `
      <div class="benchmark-row">
        <div class="benchmark-header">
          <span class="benchmark-algo-name">${a.name}</span>
          <span class="benchmark-val-text">Completed: ${r.completedJobs} | Misses: ${r.deadlineMisses}</span>
        </div>
        <div class="benchmark-bar-track">
          <div class="benchmark-fill-completed" style="width: ${completedPct}%;" title="Completed Jobs"></div>
          <div class="benchmark-fill-misses" style="width: ${missedPct}%;" title="Missed Deadlines"></div>
        </div>
      </div>
    `;

    switchesHtml += `
      <div class="benchmark-row">
        <div class="benchmark-header">
          <span class="benchmark-algo-name">${a.name}</span>
          <span class="benchmark-val-text">${r.contextSwitches} Preemptions (${r.idleTicks} Idle Ticks)</span>
        </div>
        <div class="benchmark-bar-track">
          <div class="benchmark-fill-switches" style="width: ${switchesPct}%;"></div>
        </div>
      </div>
    `;
  });

  jobsChart.innerHTML = jobsHtml;
  switchesChart.innerHTML = switchesHtml;
}

// ==============================================================
// 9. BACKEND API & MYSQL INTEGRATION
// ==============================================================

async function checkDatabaseStatus() {
  const dot = document.getElementById('db-status-dot');
  const title = document.getElementById('db-status-text');
  const sub = document.getElementById('db-status-sub');
  const banner = document.getElementById('db-notice-banner');

  try {
    const res = await fetch('/api/health');
    const data = await res.json();

    if (data.database && data.database.connected) {
      state.dbConnected = true;
      dot.className = 'status-indicator-dot online';
      title.textContent = 'MySQL Online';
      sub.textContent = `${data.database.database} @ ${data.database.host}`;
      banner.classList.add('hidden');
    } else {
      state.dbConnected = false;
      dot.className = 'status-indicator-dot offline';
      title.textContent = 'MySQL Offline';
      sub.textContent = 'Local In-Memory Mode';
      banner.classList.remove('hidden');
      if (data.database && data.database.error) {
        document.getElementById('db-notice-msg').textContent = 
          `MySQL Connection Notice: ${data.database.error}. You can run simulations in-memory. To enable persistence, verify .env credentials and execute database/schema.sql.`;
      }
    }
  } catch (err) {
    state.dbConnected = false;
    dot.className = 'status-indicator-dot offline';
    title.textContent = 'Server / DB Offline';
    sub.textContent = 'Check Node Express server';
  }
}

async function fetchDashboardStats() {
  try {
    const res = await fetch('/api/dashboard/stats');
    const data = await res.json();

    if (data.success) {
      document.getElementById('dash-total-sims').textContent = data.totalSimulations;
      renderRecentSimulationsTable(data.recentSimulations || []);
    }
  } catch (err) {
    console.warn('[Dashboard] Error fetching stats:', err);
  }
}

function renderRecentSimulationsTable(sims) {
  const tbody = document.getElementById('tbody-recent-sims');
  if (!tbody) return;

  if (sims.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No saved simulations in MySQL yet. Execute a simulation and click "Save to MySQL".</td></tr>';
    return;
  }

  let html = '';
  for (const s of sims) {
    const dateStr = s.created_at ? new Date(s.created_at).toLocaleString() : 'Just now';
    const isSched = s.schedulability_status === 'SCHEDULABLE';

    html += `
      <tr>
        <td><strong>#${s.simulation_id}</strong></td>
        <td><span class="badge badge-info">${s.algorithm}</span></td>
        <td>${s.cpu_utilization}%</td>
        <td><span class="badge ${isSched ? 'badge-success' : 'badge-danger'}">${s.schedulability_status}</span></td>
        <td>${s.deadline_misses}</td>
        <td>${dateStr}</td>
        <td>
          <button class="btn btn-secondary btn-xs" onclick="viewSimulationDetails(${s.simulation_id})">View</button>
        </td>
      </tr>
    `;
  }

  tbody.innerHTML = html;
}

/**
 * Save current simulation run to MySQL database
 */
async function saveCurrentSimulationToBackend() {
  if (state.tasks.length === 0) {
    showToast('Cannot save an empty task configuration.', 'danger');
    return;
  }

  const simResult = state.simResult || runSimulationEngine(state.tasks, state.currentAlgo, state.simulationHorizon);
  const totalU = calculateTotalUtilization(state.tasks);

  const payload = {
    algorithm: state.currentAlgo,
    cpu_utilization: (totalU * 100).toFixed(2),
    schedulability_status: simResult.deadlineMisses === 0 ? 'SCHEDULABLE' : 'UNSCHEDULABLE',
    deadline_misses: simResult.deadlineMisses,
    simulation_horizon: state.simulationHorizon,
    tasks: state.tasks.map(t => ({
      task_name: t.name,
      execution_time: t.c,
      period: t.t,
      deadline: t.d,
      arrival_time: t.a
    })),
    results: simResult.slices.map(s => ({
      task_name: s.taskName,
      start_time: s.startTime,
      end_time: s.endTime,
      absolute_deadline: s.absDeadline || 0,
      status: s.status || 'COMPLETED'
    }))
  };

  try {
    const res = await fetch('/api/simulations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (data.success) {
      showToast(`Simulation saved to MySQL (ID: #${data.simulationId})`, 'success');
      fetchDashboardStats();
      fetchHistoryList();
    } else {
      showToast(data.message || 'Failed to save simulation to MySQL.', 'danger');
    }
  } catch (err) {
    showToast(`Network Error: ${err.message}`, 'danger');
  }
}

/**
 * History view initialization & loading
 */
function initHistoryEvents() {
  document.getElementById('btn-reload-history').addEventListener('click', () => {
    fetchHistoryList();
    showToast('Reloaded simulation history from MySQL.', 'info');
  });

  document.getElementById('btn-refresh-dash-sims').addEventListener('click', () => {
    fetchDashboardStats();
    showToast('Refreshed recent simulation runs.', 'info');
  });

  // Modal dismiss buttons
  document.getElementById('btn-close-sim-details').addEventListener('click', closeDetailsModal);
  document.getElementById('btn-dismiss-details').addEventListener('click', closeDetailsModal);
}

async function fetchHistoryList() {
  const tbody = document.getElementById('tbody-history');
  if (!tbody) return;

  try {
    const res = await fetch('/api/simulations');
    const data = await res.json();

    if (!data.success || !data.data || data.data.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" class="text-center text-muted">
            ${data.dbConnected === false 
              ? 'MySQL is offline. Verify your .env database credentials to access persisted history.' 
              : 'No recorded simulations found. Run a simulation and click "Save to MySQL".'}
          </td>
        </tr>
      `;
      return;
    }

    state.savedSimulations = data.data;

    let html = '';
    for (const sim of data.data) {
      const dateStr = sim.created_at ? new Date(sim.created_at).toLocaleString() : '-';
      const isSched = sim.schedulability_status === 'SCHEDULABLE';

      html += `
        <tr>
          <td><strong>#${sim.simulation_id}</strong></td>
          <td><span class="badge badge-info">${sim.algorithm}</span></td>
          <td>${sim.cpu_utilization}%</td>
          <td><span class="badge ${isSched ? 'badge-success' : 'badge-danger'}">${sim.schedulability_status}</span></td>
          <td>${sim.deadline_misses}</td>
          <td>${sim.simulation_horizon} ticks</td>
          <td>${sim.total_tasks || '-'}</td>
          <td>${dateStr}</td>
          <td>
            <button class="btn btn-secondary btn-xs" onclick="viewSimulationDetails(${sim.simulation_id})">View Details</button>
            <button class="btn btn-danger btn-xs" onclick="deleteSimulationRecord(${sim.simulation_id})">Delete</button>
          </td>
        </tr>
      `;
    }

    tbody.innerHTML = html;
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center text-danger">Error communicating with backend: ${err.message}</td></tr>`;
  }
}

async function viewSimulationDetails(simulationId) {
  try {
    const res = await fetch(`/api/simulations/${simulationId}`);
    const data = await res.json();

    if (!data.success) {
      showToast(data.message || 'Failed to retrieve simulation details.', 'danger');
      return;
    }

    const sim = data.data;
    document.getElementById('sim-details-title').textContent = `Simulation Record #${sim.simulation_id} (${sim.algorithm})`;

    // Populate Meta Strip
    const metaStrip = document.getElementById('sim-meta-strip');
    metaStrip.innerHTML = `
      <div class="meta-item">
        <span class="meta-label">Algorithm</span>
        <span class="meta-val">${sim.algorithm}</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">Utilization</span>
        <span class="meta-val">${sim.cpu_utilization}%</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">Status</span>
        <span class="meta-val ${sim.schedulability_status === 'SCHEDULABLE' ? 'text-success' : 'text-danger'}">${sim.schedulability_status}</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">Horizon</span>
        <span class="meta-val">${sim.simulation_horizon} ticks</span>
      </div>
    `;

    // Populate Tasks
    const tbodyTasks = document.getElementById('tbody-details-tasks');
    tbodyTasks.innerHTML = (sim.tasks || []).map(t => `
      <tr>
        <td><strong>${t.task_name}</strong></td>
        <td>${t.execution_time}</td>
        <td>${t.period}</td>
        <td>${t.deadline}</td>
        <td>${t.arrival_time}</td>
        <td>${((t.execution_time / t.period) * 100).toFixed(1)}%</td>
      </tr>
    `).join('');

    // Populate Results
    const tbodyResults = document.getElementById('tbody-details-results');
    tbodyResults.innerHTML = (sim.results || []).map((r, i) => `
      <tr>
        <td>Slice #${i + 1}</td>
        <td><strong>${r.task_name}</strong></td>
        <td>t = ${r.start_time}</td>
        <td>t = ${r.end_time}</td>
        <td>${r.absolute_deadline || '-'}</td>
        <td><span class="badge ${r.status === 'IDLE' ? 'badge-secondary' : 'badge-success'}">${r.status}</span></td>
      </tr>
    `).join('');

    // Hook "Load into Active Workbench" button
    const btnLoad = document.getElementById('btn-load-into-workbench');
    btnLoad.onclick = () => {
      if (sim.tasks && sim.tasks.length > 0) {
        state.tasks = sim.tasks.map(t => ({
          id: t.task_name,
          name: t.task_name,
          c: t.execution_time,
          t: t.period,
          d: t.deadline,
          a: t.arrival_time
        }));
        state.currentAlgo = sim.algorithm;
        state.simulationHorizon = sim.simulation_horizon;
        document.getElementById('sim-algo-select').value = sim.algorithm;
        document.getElementById('sim-horizon-input').value = sim.simulation_horizon;
        recalculateAll();
        closeDetailsModal();
        switchTab('cpu-simulation');
        showToast(`Loaded simulation #${sim.simulation_id} configuration into workbench.`, 'success');
      }
    };

    document.getElementById('modal-sim-details').classList.remove('hidden');
  } catch (err) {
    showToast(`Error loading details: ${err.message}`, 'danger');
  }
}

function closeDetailsModal() {
  document.getElementById('modal-sim-details').classList.add('hidden');
}

async function deleteSimulationRecord(simulationId) {
  if (!confirm(`Are you sure you want to delete simulation #${simulationId} from MySQL?`)) {
    return;
  }

  try {
    const res = await fetch(`/api/simulations/${simulationId}`, { method: 'DELETE' });
    const data = await res.json();

    if (data.success) {
      showToast(`Simulation #${simulationId} deleted successfully.`, 'info');
      fetchHistoryList();
      fetchDashboardStats();
    } else {
      showToast(data.message || 'Failed to delete simulation.', 'danger');
    }
  } catch (err) {
    showToast(`Error deleting simulation: ${err.message}`, 'danger');
  }
}

// ==============================================================
// 10. TECHNICAL REPORT GENERATOR & PRINT PDF
// ==============================================================

function initReportEvents() {
  document.getElementById('btn-open-report').addEventListener('click', generateProjectReport);
  document.getElementById('btn-close-report').addEventListener('click', () => {
    document.getElementById('modal-report').classList.add('hidden');
  });
  document.getElementById('btn-dismiss-report').addEventListener('click', () => {
    document.getElementById('modal-report').classList.add('hidden');
  });
  document.getElementById('btn-trigger-print').addEventListener('click', () => {
    window.print();
  });
}

function generateProjectReport() {
  const container = document.getElementById('report-printable-area');
  const tasks = state.tasks;
  const n = tasks.length;
  const totalU = calculateTotalUtilization(tasks);
  const hyperperiod = calculateHyperperiod(tasks);
  const llBound = calculateLiuLaylandBound(n);
  const rtaResults = performResponseTimeAnalysis(tasks);
  const edfResult = evaluateEDFSchedulability(tasks);
  const sim = state.simResult || runSimulationEngine(tasks, state.currentAlgo, state.simulationHorizon);

  let taskRowsHtml = tasks.map(t => `
    <tr>
      <td>${t.name}</td>
      <td>${t.c}</td>
      <td>${t.t}</td>
      <td>${t.d}</td>
      <td>${t.a}</td>
      <td>${((t.c / t.t) * 100).toFixed(2)}%</td>
    </tr>
  `).join('');

  let rtaRowsHtml = rtaResults.map(r => `
    <tr>
      <td>Rank ${r.priorityRank}</td>
      <td>${r.taskName}</td>
      <td>${r.c}</td>
      <td>${r.t}</td>
      <td>${r.d}</td>
      <td>${r.iterationStepsText}</td>
      <td>${r.worstCaseResponseTime} ticks</td>
      <td>${r.schedulable ? 'PASS (R <= D)' : 'FAIL (R > D)'}</td>
    </tr>
  `).join('');

  container.innerHTML = `
    <div style="padding: 10px 0;">
      <h2 style="font-size: 20px; color: #0284c7; margin-bottom: 4px;">OPERATING SYSTEMS PROJECT: REAL-TIME TASK SCHEDULABILITY REPORT</h2>
      <p style="font-size: 12px; color: #64748b; margin-bottom: 16px;">Generated on: ${new Date().toLocaleString()} | Evaluator: Antigravity OS Laboratory</p>

      <h3 style="font-size: 15px; margin-top: 14px; margin-bottom: 6px; border-bottom: 1px solid #ccc; padding-bottom: 4px;">1. Task Set Configuration</h3>
      <table class="data-table" style="width: 100%; margin-bottom: 14px;">
        <thead>
          <tr>
            <th>Task ID</th>
            <th>Execution Time (C)</th>
            <th>Period (T)</th>
            <th>Relative Deadline (D)</th>
            <th>Arrival Time (A)</th>
            <th>Utilization (Ci / Ti)</th>
          </tr>
        </thead>
        <tbody>
          ${taskRowsHtml}
        </tbody>
      </table>

      <h3 style="font-size: 15px; margin-top: 14px; margin-bottom: 6px; border-bottom: 1px solid #ccc; padding-bottom: 4px;">2. Theoretical Schedulability Evaluation</h3>
      <div style="font-size: 13px; line-height: 1.6; margin-bottom: 14px;">
        <p>&bull; <strong>Total System Utilization (U):</strong> \\(U = \\sum \\frac{C_i}{T_i} = ${(totalU * 100).toFixed(2)}\\%\\) (${totalU <= 1 ? 'Feasible capacity' : 'Overloaded'})</p>
        <p>&bull; <strong>Hyperperiod:</strong> \\(LCM(T_1, \\dots, T_n) = ${hyperperiod}\\) ticks</p>
        <p>&bull; <strong>Liu-Layland Bound for RMS:</strong> \\(U_{LL}(${n}) = ${n}(2^{1/${n}} - 1) = ${(llBound * 100).toFixed(2)}\\%\\). (Since \\(U = ${(totalU * 100).toFixed(2)}\\% > ${(llBound * 100).toFixed(2)}\\%\\), the sufficient test is inconclusive; exact Response Time Analysis required).</p>
        <p>&bull; <strong>EDF Feasibility Condition:</strong> ${edfResult.condition} &rarr; <strong>${edfResult.schedulable ? 'SCHEDULABLE' : 'UNSCHEDULABLE'}</strong></p>
      </div>

      <h3 style="font-size: 15px; margin-top: 14px; margin-bottom: 6px; border-bottom: 1px solid #ccc; padding-bottom: 4px;">3. Exact Response Time Analysis (Joseph & Pandya Recurrence)</h3>
      <table class="data-table" style="width: 100%; margin-bottom: 14px;">
        <thead>
          <tr>
            <th>Priority</th>
            <th>Task</th>
            <th>Ci</th>
            <th>Ti</th>
            <th>Di</th>
            <th>Recurrence Steps</th>
            <th>Worst-Case Ri</th>
            <th>Verdict</th>
          </tr>
        </thead>
        <tbody>
          ${rtaRowsHtml}
        </tbody>
      </table>

      <h3 style="font-size: 15px; margin-top: 14px; margin-bottom: 6px; border-bottom: 1px solid #ccc; padding-bottom: 4px;">4. Simulation Execution Telemetry (${state.currentAlgo})</h3>
      <div style="font-size: 13px; line-height: 1.6; margin-bottom: 14px;">
        <p>&bull; <strong>Simulation Algorithm:</strong> ${state.currentAlgo}</p>
        <p>&bull; <strong>Horizon Tested:</strong> ${state.simulationHorizon} ticks</p>
        <p>&bull; <strong>Completed Jobs:</strong> ${sim.completedJobs}</p>
        <p>&bull; <strong>Deadline Misses Detected:</strong> ${sim.deadlineMisses} (Result: ${sim.deadlineMisses === 0 ? '100% Meets All Deadlines' : 'DEADLINE VIOLATION OCCURRED'})</p>
        <p>&bull; <strong>Preemptions Recorded:</strong> ${sim.contextSwitches}</p>
        <p>&bull; <strong>Total Idle Ticks:</strong> ${sim.idleTicks} ticks</p>
      </div>
    </div>
  `;

  document.getElementById('modal-report').classList.remove('hidden');
}

// ==============================================================
// 11. UI TOAST NOTIFICATION UTILITY
// ==============================================================

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}
