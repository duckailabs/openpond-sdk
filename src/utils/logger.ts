export class Logger {
  static info(context: string, message: string, meta?: any) {
    console.log(`[${context}] ${message}`, meta ? meta : "");
  }

  static error(context: string, message: string, meta?: any) {
    console.error(`[${context}] ${message}`, meta ? meta : "");
  }

  static warn(context: string, message: string, meta?: any) {
    console.warn(`[${context}] ${message}`, meta ? meta : "");
  }

  static debug(context: string, message: string, meta?: any) {
    console.debug(`[${context}] ${message}`, meta ? meta : "");
  }
}
