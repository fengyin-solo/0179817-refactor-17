/**
 * 日志工具类 - 统一日志级别、输出格式、上下文串联与性能计时
 *
 * - 级别: DEBUG / INFO / WARN / ERROR，分别走 console.debug / log / warn / error
 * - 格式: [时间] [级别] [上下文?] [模块] 消息，附加数据统一作为第二个参数
 * - 上下文: Logger.startContext / endContext，一次业务流程内所有模块输出同一个编号
 * - 计时: timeStart / timeEnd / measure，计时结果走同一日志出口，不再使用 console.time
 */

const LEVEL_CHANNELS = {
  DEBUG: 'debug',
  INFO: 'log',
  WARN: 'warn',
  ERROR: 'error'
};

// 上下文为跨 Logger 实例的共享状态：同一次分析里各模块输出同一个编号
let contextSeq = 0;
let activeContext = null;

// 未处于上下文时使用的兜底计时器（上下文内的计时器随上下文一起回收）
const looseTimers = new Map();

export class Logger {
  constructor(module) {
    this.module = module;
    this.enabled = true; // 可以通过配置禁用日志
  }

  /**
   * 开启一次业务上下文（如一次音频分析）
   * 重入时直接开启全新上下文，上一个上下文的编号与计时器不会残留
   * @param {string} name - 上下文名称，只声明业务含义，不拼格式
   * @returns {number} 上下文编号
   */
  static startContext(name) {
    contextSeq += 1;
    activeContext = { name, id: contextSeq, timers: new Map() };
    return activeContext.id;
  }

  /**
   * 结束当前上下文，之后的日志恢复为无上下文格式
   */
  static endContext() {
    activeContext = null;
  }

  /**
   * 统一日志出口：时间戳、级别、上下文编号、模块名只在此一处拼装
   * @param {string} level - 日志级别
   * @param {string} message - 日志消息
   * @param {*} data - 附加数据（可选）
   */
  write(level, message, data = null) {
    if (!this.enabled) return;

    const timestamp = new Date().toISOString();
    const contextPart = activeContext ? ` [${activeContext.name}#${activeContext.id}]` : '';
    const prefix = `[${timestamp}] [${level}]${contextPart} [${this.module}]`;
    const channel = LEVEL_CHANNELS[level];

    if (data !== null && data !== undefined) {
      console[channel](`${prefix} ${message}`, data);
    } else {
      console[channel](`${prefix} ${message}`);
    }
  }

  /**
   * 调试日志
   */
  debug(message, data = null) {
    this.write('DEBUG', message, data);
  }

  /**
   * 信息日志
   */
  info(message, data = null) {
    this.write('INFO', message, data);
  }

  /**
   * 警告日志
   */
  warn(message, data = null) {
    this.write('WARN', message, data);
  }

  /**
   * 错误日志
   */
  error(message, error = null) {
    this.write('ERROR', message, error);
  }

  /**
   * 计时器按模块隔离，避免不同模块同名标签互相干扰
   */
  timerKey(label) {
    return `${this.module}::${label}`;
  }

  /**
   * 性能计时开始
   */
  timeStart(label) {
    if (!this.enabled) return;
    const timers = activeContext ? activeContext.timers : looseTimers;
    timers.set(this.timerKey(label), { startedAt: performance.now() });
  }

  /**
   * 性能计时结束，耗时通过统一日志出口输出，调用处只需提供标签
   */
  timeEnd(label) {
    if (!this.enabled) return;

    const timers = activeContext ? activeContext.timers : looseTimers;
    const key = this.timerKey(label);
    const timer = timers.get(key);

    if (!timer) {
      this.warn('计时未开始或已结束', { label });
      return;
    }

    timers.delete(key);
    const durationMs = Number((performance.now() - timer.startedAt).toFixed(2));
    this.info(`${label}耗时`, { durationMs });
  }

  /**
   * 声明式计时：执行 fn 并保证结束时一定输出耗时（异常也不泄漏计时器）
   * @param {string} label - 计时标签
   * @param {Function} fn - 被计时的操作（同步或异步）
   * @returns {*} fn 的返回值
   */
  async measure(label, fn) {
    this.timeStart(label);
    try {
      return await fn();
    } finally {
      this.timeEnd(label);
    }
  }
}
