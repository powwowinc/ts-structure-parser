"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ts = require("typescript");
exports.tsm = require("./tsASTMatchers");
exports.helperMethodExtractor = require("./helperMethodExtractor");
const fsUtil = require("./fsUtils");
const index_1 = require("../index");
const index_2 = require("../index");
const jsonTransformer_1 = require("./jsonTransformer");
function parse(content) {
    return ts.createSourceFile("sample.ts", content, ts.ScriptTarget.ES3, true);
}
var fld = exports.tsm.Matching.field();
function parseStruct(content, modules, mpth) {
    var mod = parse(content);
    var module = { functions: [], classes: [], aliases: [], enumDeclarations: [], imports: {}, _imports: [], name: mpth };
    modules[mpth] = module;
    var currentModule = null;
    exports.tsm.Matching.visit(mod, x => {
        if (x.kind === ts.SyntaxKind.VariableDeclaration) {
            x.forEachChild(c => {
                if (c.kind === ts.SyntaxKind.FunctionExpression) {
                    const isExport = !!(x.parent.parent.modifiers || []).find(mod => mod.kind === ts.SyntaxKind.ExportKeyword);
                    const params = [];
                    let isAsync = !!(c.modifiers || []).find(m => m.kind === ts.SyntaxKind.AsyncKeyword);
                    const name = x.name.escapedText;
                    c.parameters.forEach(param => {
                        params.push({
                            name: param.name.getText(),
                            type: (param.type && param.type.getText()) || "any",
                            mandatory: !param.questionToken
                        });
                    });
                    module.functions.push({
                        isArrow: false,
                        isExport,
                        isAsync,
                        name,
                        params,
                    });
                }
            });
        }
        if (x.kind === ts.SyntaxKind.ImportDeclaration) {
            var impDec = x;
            var localMod = parse(x.getText());
            var localImport = { clauses: [], absPathNode: [], absPathString: "", isNodeModule: false };
            var localNamedImports;
            var localAbsPath;
            var localAbsPathString;
            var localNodeModule = false;
            var pth = require("path");
            exports.tsm.Matching.visit(localMod, y => {
                var _import = {};
                if (y.kind === ts.SyntaxKind.NamedImports) {
                    var lit = impDec.importClause.getText();
                    localNamedImports = lit.substring(1, lit.length - 1).split(",");
                    localImport.clauses = localNamedImports.map(im => {
                        return im.trim();
                    });
                }
                if (y.kind === ts.SyntaxKind.StringLiteral) {
                    var localPath = y.getText().substring(1, y.getText().length - 1);
                    if (localPath[0] === ".") {
                        var localP = fsUtil.resolve(fsUtil.dirname(mpth) + "/", localPath);
                        localAbsPath = localP.split(pth.sep);
                        localAbsPathString = localP;
                    }
                    else {
                        localAbsPath = localPath.split(pth.sep);
                        localAbsPathString = localPath;
                        localNodeModule = true;
                    }
                    localImport.absPathNode = localAbsPath;
                    localImport.absPathString = localAbsPathString.replace(/[\\/]+/g, "/");
                    localImport.isNodeModule = localNodeModule;
                }
            });
            module._imports.push(localImport);
        }
        if (x.kind === ts.SyntaxKind.FunctionDeclaration || x.kind === ts.SyntaxKind.ArrowFunction) {
            const isArrow = x.kind === ts.SyntaxKind.ArrowFunction;
            const functionDeclaration = isArrow ? x : x;
            const parentVariable = functionDeclaration.parent;
            const name = isArrow
                ? parentVariable.name && parentVariable.name.getText()
                : functionDeclaration.name.text;
            let isAsync = false;
            let isExport = false;
            let params = [];
            if (name) {
                let modifierContainer = isArrow
                    ? functionDeclaration.parent.initializer
                    : functionDeclaration;
                if (modifierContainer && modifierContainer.modifiers) {
                    modifierContainer.modifiers.forEach(modi => {
                        if (modi.kind === ts.SyntaxKind.AsyncKeyword) {
                            isAsync = true;
                        }
                        if (modi.kind === ts.SyntaxKind.ExportKeyword && !isArrow) {
                            isExport = true;
                        }
                    });
                }
                if (isArrow && !isExport) {
                    do {
                        modifierContainer = modifierContainer.parent;
                    } while (modifierContainer && modifierContainer.kind !== ts.SyntaxKind.VariableStatement);
                    if (modifierContainer && modifierContainer.modifiers) {
                        modifierContainer.modifiers.forEach(modi => {
                            if (modi.kind === ts.SyntaxKind.ExportKeyword) {
                                isExport = true;
                            }
                        });
                    }
                }
                functionDeclaration.parameters.forEach(param => {
                    params.push({
                        name: param.name.getText(),
                        type: (param.type && param.type.getText()) || "any",
                        mandatory: !param.questionToken
                    });
                });
                module.functions.push({
                    isArrow,
                    isExport,
                    isAsync,
                    name,
                    params,
                });
            }
        }
        if (x.kind === ts.SyntaxKind.ModuleDeclaration) {
            var cmod = x;
            currentModule = cmod.name.text;
        }
        if (x.kind === ts.SyntaxKind.ImportEqualsDeclaration) {
            var imp = x;
            var namespace = imp.name.text;
            if (namespace === "RamlWrapper") {
                return;
            }
            var path = imp.moduleReference;
            var literal = path.expression;
            var importPath = literal.text;
            var absPath = fsUtil.resolve(fsUtil.dirname(mpth) + "/", importPath) + ".ts";
            if (!fsUtil.existsSync(absPath)) {
                throw new Error("Path " + importPath + " resolve to " + absPath + "do not exists");
            }
            if (!modules[absPath]) {
                var cnt = fsUtil.readFileSync(absPath);
                var mod = parseStruct(cnt, modules, absPath);
            }
            module.imports[namespace] = modules[absPath];
        }
        if (x.kind === ts.SyntaxKind.TypeAliasDeclaration) {
            var u = x;
            if (u.name) {
                var aliasName = u.name.text;
                var type = buildType(u.type, mpth);
                module.aliases.push({ name: aliasName, type: type });
            }
        }
        if (x.kind === ts.SyntaxKind.EnumDeclaration) {
            var e = x;
            var members = [];
            if (e.members) {
                e.members.forEach(member => {
                    let value;
                    if (member.initializer) {
                        if (member.initializer.kind === ts.SyntaxKind.NumericLiteral) {
                            value = parseInt(member.initializer.text);
                        }
                        if (member.initializer.kind === ts.SyntaxKind.StringLiteral ||
                            member.initializer.kind === ts.SyntaxKind.JsxText) {
                            value = String(member.initializer.text);
                        }
                    }
                    members.push({
                        name: String(member.name.text),
                        value,
                    });
                });
            }
            if (e.name) {
                module.enumDeclarations.push({ name: e.name.text, members: members });
            }
        }
        var isInterface = x.kind === ts.SyntaxKind.InterfaceDeclaration;
        var isClass = x.kind === ts.SyntaxKind.ClassDeclaration;
        if (!isInterface && !isClass) {
            return;
        }
        var c = x;
        if (c) {
            var fields = {};
            var clazz = index_2.classDecl(c.name.text, isInterface);
            if (c.decorators && c.decorators.length) {
                clazz.decorators = c.decorators.map((el) => buildDecorator(el.expression));
            }
            clazz.moduleName = currentModule;
            module.classes.push(clazz);
            c.members.forEach(x => {
                if (x.kind === ts.SyntaxKind.MethodDeclaration) {
                    var md = x;
                    var method = buildMethod(md, content, mpth);
                    clazz.methods.push(method);
                }
                var field = fld.doMatch(x);
                if (field) {
                    var f = buildField(field, mpth);
                    if (f.name === "$") {
                        clazz.annotations = f.annotations;
                    }
                    else {
                        if (f.name.charAt(0) !== "$" || f.name === "$ref") {
                            fields[f.name] = f;
                            clazz.fields.push(f);
                        }
                        else {
                            var targetField = f.name.substr(1);
                            var of = fields[targetField];
                            if (!of) {
                                if (f.name !== "$$") {
                                    var overridings = clazz.annotationOverridings[targetField];
                                    if (!overridings) {
                                        overridings = [];
                                    }
                                    clazz.annotationOverridings[targetField] = overridings.concat(f.annotations);
                                }
                            }
                            else {
                                of.annotations = f.annotations;
                            }
                        }
                    }
                }
            });
            if (c.typeParameters) {
                c.typeParameters.forEach(x => {
                    clazz.typeParameters.push(x.name["text"]);
                    if (!x.constraint) {
                        clazz.typeParameterConstraint.push(null);
                    }
                    else {
                        clazz.typeParameterConstraint.push(x.constraint["typeName"] ? x.constraint["typeName"]["text"] : null);
                    }
                });
            }
            if (c.heritageClauses) {
                c.heritageClauses.forEach(x => {
                    x.types.forEach(y => {
                        if (x.token === ts.SyntaxKind.ExtendsKeyword) {
                            clazz.extends.push(buildType(y, mpth));
                        }
                        else {
                            if (x.token === ts.SyntaxKind.ImplementsKeyword) {
                                clazz.implements.push(buildType(y, mpth));
                            }
                            else {
                                throw new Error("Unknown token class heritage");
                            }
                        }
                    });
                });
            }
            return exports.tsm.Matching.SKIP;
        }
    });
    return module;
}
exports.parseStruct = parseStruct;
function buildField(f, path) {
    return {
        name: f.name["text"],
        type: buildType(f.type, path),
        annotations: f.name["text"].charAt(0) === "$" ? buildInitializer(f.initializer) : [],
        valueConstraint: f.name["text"].charAt(0) !== "$" ? buildConstraint(f.initializer) : null,
        optional: f.questionToken != null,
        decorators: (f.decorators && f.decorators.length) ? f.decorators.map((el) => buildDecorator(el.expression)) : [],
    };
}
function buildMethod(md, content, path) {
    var aliasName = md.name.text;
    var text = content.substring(md.pos, md.end);
    var params = [];
    md.parameters.forEach(x => {
        params.push(buildParameter(x, content, path));
    });
    var method = {
        returnType: buildType(md.type, path),
        name: aliasName,
        start: md.pos,
        end: md.end,
        text: text,
        arguments: params
    };
    return method;
}
function buildParameter(f, content, path) {
    var text = content.substring(f.pos, f.end);
    return {
        name: f.name["text"],
        start: f.pos,
        end: f.end,
        text: text,
        type: buildType(f.type, path)
    };
}
function buildConstraint(e) {
    if (!e) {
        return null;
    }
    if (e.kind === ts.SyntaxKind.CallExpression) {
        return {
            isCallConstraint: true,
            value: buildAnnotation(e)
        };
    }
    else {
        return {
            isCallConstraint: false,
            value: parseArg(e)
        };
    }
}
function buildInitializer(i) {
    if (!i) {
        return [];
    }
    if (i.kind === ts.SyntaxKind.ArrayLiteralExpression) {
        var arr = i;
        var annotations = [];
        arr.elements.forEach(x => {
            annotations.push(buildAnnotation(x));
        });
        return annotations;
    }
    else {
        throw new Error("Only Array Literals supported now");
    }
}
function buildAnnotation(e) {
    if (e.kind === ts.SyntaxKind.CallExpression) {
        var call = e;
        var name = parseName(call.expression);
        var a = {
            name: name,
            arguments: []
        };
        call.arguments.forEach(x => {
            a.arguments.push(parseArg(x));
        });
        return a;
    }
    else {
        throw new Error("Only call expressions may be annotations");
    }
}
function buildDecorator(e) {
    if (e.kind === ts.SyntaxKind.CallExpression) {
        var call = e;
        var name = parseName(call.expression);
        var a = {
            name: name,
            arguments: []
        };
        call.arguments.forEach(x => {
            a.arguments.push(parseArg(x));
        });
        return a;
    }
    else if (e.kind === ts.SyntaxKind.Identifier) {
        return {
            name: String(e.escapedText),
            arguments: null
        };
    }
    else {
        throw new Error("Only call expressions may be annotations");
    }
}
function parseArg(n) {
    if (n.kind === ts.SyntaxKind.StringLiteral) {
        var l = n;
        return l.text;
    }
    if (n.kind === ts.SyntaxKind.NoSubstitutionTemplateLiteral) {
        var ls = n;
        return ls.text;
    }
    if (n.kind === ts.SyntaxKind.ArrayLiteralExpression) {
        var arr = n;
        var annotations = [];
        arr.elements.forEach(x => {
            annotations.push(parseArg(x));
        });
        return annotations;
    }
    if (n.kind === ts.SyntaxKind.TrueKeyword) {
        return true;
    }
    if (n.kind === ts.SyntaxKind.PropertyAccessExpression) {
        var pa = n;
        return parseArg(pa.expression) + "." + parseArg(pa.name);
    }
    if (n.kind === ts.SyntaxKind.Identifier) {
        var ident = n;
        return ident.text;
    }
    if (n.kind === ts.SyntaxKind.FalseKeyword) {
        return false;
    }
    if (n.kind === ts.SyntaxKind.NumericLiteral) {
        var nl = n;
        return Number(nl.text);
    }
    if (n.kind === ts.SyntaxKind.BinaryExpression) {
        var bin = n;
        if (bin.operatorToken.kind = ts.SyntaxKind.PlusToken) {
            return parseArg(bin.left) + parseArg(bin.right);
        }
    }
    if (n.kind === ts.SyntaxKind.ObjectLiteralExpression) {
        const obj = n;
        let res = null;
        try {
            let jsonString = jsonTransformer_1.JSONTransformer.toValidateView(obj);
            return JSON.parse(jsonString);
        }
        catch (e) {
            console.log(`Can't parse string "${obj.getFullText()}" to json`);
        }
    }
    if (n.kind === ts.SyntaxKind.ArrowFunction) {
        return n.getText();
    }
    if (n.kind === ts.SyntaxKind.NullKeyword) {
        return null;
    }
    return n.getText();
}
exports.parseArg = parseArg;
function parseName(n) {
    if (n.kind === ts.SyntaxKind.Identifier) {
        return n["text"];
    }
    if (n.kind === ts.SyntaxKind.PropertyAccessExpression) {
        var m = n;
        return parseName(m.expression) + "." + parseName(m.name);
    }
    throw new Error("Only simple identifiers are supported now");
}
function basicType(n, path) {
    var namespaceIndex = n.indexOf(".");
    var namespace = namespaceIndex !== -1 ? n.substring(0, namespaceIndex) : "";
    var basicName = namespaceIndex !== -1 ? n.substring(namespaceIndex + 1) : n;
    return { typeName: n, nameSpace: namespace, basicName: basicName, typeKind: index_1.TypeKind.BASIC, typeArguments: [], modulePath: path };
}
function arrayType(b) {
    return { base: b, typeKind: index_1.TypeKind.ARRAY };
}
function unionType(b) {
    return { options: b, typeKind: index_1.TypeKind.UNION };
}
function buildType(t, path) {
    if (!t) {
        return null;
    }
    if (t.kind === ts.SyntaxKind.StringKeyword) {
        return basicType("string", null);
    }
    if (t.kind === ts.SyntaxKind.NumberKeyword) {
        return basicType("number", null);
    }
    if (t.kind === ts.SyntaxKind.BooleanKeyword) {
        return basicType("boolean", null);
    }
    if (t.kind === ts.SyntaxKind.NullKeyword) {
        return basicType("null", null);
    }
    if (t.kind === ts.SyntaxKind.AnyKeyword) {
        return basicType("any", null);
    }
    if (t.kind === ts.SyntaxKind.VoidKeyword) {
        return basicType("void", null);
    }
    if (t.kind === ts.SyntaxKind.TypeReference) {
        var tr = t;
        var res = basicType(parseQualified(tr.typeName), path);
        if (tr.typeArguments) {
            tr.typeArguments.forEach(x => {
                res.typeArguments.push(buildType(x, path));
            });
        }
        return res;
    }
    if (t.kind === ts.SyntaxKind.ArrayType) {
        var q = t;
        return arrayType(buildType(q.elementType, path));
    }
    if (t.kind === ts.SyntaxKind.UnionType) {
        var ut = t;
        return unionType(ut.types.map(x => buildType(x, path)));
    }
    if (t.kind === ts.SyntaxKind.ExpressionWithTypeArguments) {
        var tra = t;
        res = basicType(parseQualified2(tra.expression), path);
        if (tra.typeArguments) {
            tra.typeArguments.forEach(x => {
                res.typeArguments.push(buildType(x, path));
            });
        }
        return res;
    }
    else {
        return basicType("mock", null);
    }
}
exports.buildType = buildType;
function parseQualified2(n) {
    if (!n.name) {
        return n.text;
    }
    return n.name.text;
}
function parseQualified(n) {
    if (n.kind === ts.SyntaxKind.Identifier) {
        return n["text"];
    }
    else {
        var q = n;
        return parseQualified(q.left) + "." + parseQualified(q.right);
    }
}
//# sourceMappingURL=tsStructureParser.js.map