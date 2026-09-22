/**
 * 统一日志工具
 *
 * - 统一级别: DEBUG / INFO / WARN / ERROR，分别对应 console.debug/log/warn/error
 * - 统一格式: [时间] [级别] [模块] [上下文] 消息，附加数据始终作为第二个参数透传
 * - 一次完整操作通过 createContext() 生成唯一上下文，跨模块透传同一个 context，
 *   即可把该操作从开始到结束的全部日志（含耗时）串成同一条链路
 * - 性能计时走同一套入口: timeStart / timeEnd，结束时输出统一格式的耗时日志
 * - 调用方只声明要记什么（消息 + 数据对象），不自行拼接字符串
 */

const LEVELS = {
  DEBUG: { label: 'DEBUG', consoleMethod: 'debug' },
  INFO: { label: 'INFO', consoleMethod: 'log' },
  WARN: { label: 'WARN', consoleMethod: 'warn' },
  ERROR: { label: 'ERROR', consoleMethod: 'error' }
};

let contextSeq = 0;
const loggerCache = {};

/**
 * 获取模块日志器（统一入口，同名模块复用同一个实例）
 * @param {string} module - 模块名称
 * @returns {Logger}
 */
export function createLogger(module) {
  if (!loggerCache[module]) {
    loggerCache[module] = new Logger(module);
  }
  return loggerCache[module];
}

/**
 * 创建一次操作的上下文
 * @param {string} [name] - 操作名称，用于生成可读的上下文 ID
 * @returns {{id: string, timers: Map}} 上下文对象，在该次操作涉及的模块间透传
 */
export function createContext(name = '操作') {
  contextSeq += 1;
  return {
    id: `${name}-${contextSeq.toString(36)}`,
    timers: new Map()
  };
}

/**
 * 日志工具类 - 提供统一的日志记录功能
 */
export class Logger {
  constructor(module) {
    this.module = module;
    this.enabled = true; // 可以通过配置禁用日志
    this.localTimers = new Map(); // 未绑定上下文时的计时器
  }

  /**
   * 当前时间（优先高精度计时）
   */
  now() {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
      return performance.now();
    }
    return Date.now();
  }

  /**
   * 统一拼接日志前缀
   */
  formatPrefix(level, context = null) {
    const timestamp = new Date().toISOString();
    let prefix = `[${timestamp}] [${level}] [${this.module}]`;
    if (context) {
      prefix += ` [${context.id}]`;
    }
    return prefix;
  }

  /**
   * 统一输出入口：所有级别、计时结束日志都从这里发出
   */
  write(level, message, data = null, context = null) {
    if (!this.enabled) return;
    const { label, consoleMethod } = LEVELS[level];
    const text = `${this.formatPrefix(label, context)} ${message}`;
    if (data !== null && data !== undefined) {
      console[consoleMethod](text, data);
    } else {
      console[consoleMethod](text);
    }
  }

  /**
   * 调试日志
   */
  debug(message, data = null, context = null) {
    this.write('DEBUG', message, data, context);
  }

  /**
   * 信息日志
   */
  info(message, data = null, context = null) {
    this.write('INFO', message, data, context);
  }

  /**
   * 警告日志
   */
  warn(message, data = null, context = null) {
    this.write('WARN', message, data, context);
  }

  /**
   * 错误日志
   */
  error(message, error = null, context = null) {
    this.write('ERROR', message, error, context);
  }

  /**
   * 性能计时开始（与该次操作的上下文绑定，重入互不干扰）
   * @param {string} label - 计时项名称
   * @param {Object|null} [context] - createContext() 返回的上下文
   */
  timeStart(label, context = null) {
    if (!this.enabled) return;
    const timers = context ? context.timers : this.localTimers;
    timers.set(this.timerKey(label, context), this.now());
  }

  /**
   * 性能计时结束，通过统一日志入口输出耗时
   * @param {string} label - 计时项名称，需与 timeStart 一致
   * @param {Object|null} [context] - createContext() 返回的上下文
   * @param {string} [level] - 输出级别，默认 INFO；细粒度计时可传 'DEBUG'
   */
  timeEnd(label, context = null, level = 'INFO') {
    if (!this.enabled) return;
    const timers = context ? context.timers : this.localTimers;
    const key = this.timerKey(label, context);
    const startedAt = timers.get(key);
    if (startedAt === undefined) return;
    timers.delete(key);
    const elapsedMs = Math.round((this.now() - startedAt) * 100) / 100;
    this.write(level, `${label}耗时`, { elapsedMs }, context);
  }

  timerKey(label, context) {
    return context ? `${this.module}:${label}` : label;
  }
}
