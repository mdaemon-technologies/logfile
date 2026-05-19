import * as fs from 'fs';
export declare const getDate: () => string;
export declare const getTime: () => string;
export declare const getDateTime: () => string;
export declare const endWithNewLine: (str: string) => string;
export declare const stringifyArgs: (arg: Error | Object | any) => string | undefined;
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
