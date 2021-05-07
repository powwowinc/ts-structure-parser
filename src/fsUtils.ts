import * as pth from "path";
import * as fs from "fs";


export function resolve(p1: string, p2: string): string {
    return 'path.resolve';
    // return pth.resolve(p1, p2);
}

export function readFileSync(p: string): string {
    return 'readFileSync';
    // return fs.readFileSync(p).toString();
}

export function dirname(p: string) {
    return 'dirname';
    // return pth.dirname(p);
}

export function existsSync(p: string): boolean {
    return false;
    // return fs.existsSync(p);
}
