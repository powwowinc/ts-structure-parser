"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function resolve(p1, p2) {
    return "path.resolve";
}
exports.resolve = resolve;
function readFileSync(p) {
    return "readFileSync";
}
exports.readFileSync = readFileSync;
function dirname(p) {
    return "dirname";
}
exports.dirname = dirname;
function existsSync(p) {
    return false;
}
exports.existsSync = existsSync;
//# sourceMappingURL=fsUtils.js.map