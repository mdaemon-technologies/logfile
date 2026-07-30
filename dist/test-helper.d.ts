import * as fs from 'fs';
import { getDate, getTime, getDateTime, endWithNewLine, stringifyArgs } from './util';
export { getDate, getTime, getDateTime, endWithNewLine, stringifyArgs };
declare global {
    var __TEST_HELPER_SETUP__: boolean;
    var existsSync: typeof fs.existsSync;
    var writeFileSync: typeof fs.writeFileSync;
    var appendFileSync: typeof fs.appendFileSync;
    var mkdirSync: typeof fs.mkdirSync;
    var getDate: (arg?: any) => string;
    var getTime: (arg?: any) => string;
    var getDateTime: (arg?: any) => string;
    var endWithNewLine: (str: string) => string;
    var stringifyArgs: (arg: any) => string | undefined;
}
export declare function getLogFile(): Promise<any>;
export { fs };
