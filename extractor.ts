import * as ts from 'typescript';
import { AllTypes, NativeType, PrimitiveType, Prop, UnionType, InterfaceType } from './types';
export function extractTypes(program: ts.Program) {
    const checker = program.getTypeChecker();
    const types = new Map<ts.Type, AllTypes>();
    let id = 0;
    return (sourceFile: ts.SourceFile) => {
        function getType(nullableTsType: ts.Type, rawType?: string): AllTypes {
            const tsType = nullableTsType.getNonNullableType();

            let type = types.get(tsType);
            if (type) return type;

            const symbol = tsType.symbol as ts.Symbol | undefined;

            const isString = tsType.flags & ts.TypeFlags.String;
            const isNumber = tsType.flags & ts.TypeFlags.Number;
            const isBoolean = tsType.flags & ts.TypeFlags.Boolean;
            if (isString || isNumber || isBoolean) {
                const type: PrimitiveType = {
                    kind: 'primitive',
                    type: rawType || checker.typeToString(tsType),
                    literal: undefined,
                };
                return type;
            }
            if (tsType.isLiteral()) {
                const type: PrimitiveType = {
                    kind: 'primitive',
                    type: rawType || isString ? 'string' : isNumber ? 'number' : isBoolean ? 'boolean' : 'other',
                    literal: tsType.value as string,
                };
                return type;
            }

            if ((checker as any).isArrayLikeType(tsType)) {
                const type: NativeType = {
                    kind: 'native',
                    type: 'array',
                    element: getType((tsType as any).typeArguments![0]),
                };
                return type;
            }
            if (symbol && symbol.name === 'Date') {
                const type: PrimitiveType = {
                    kind: 'primitive',
                    type: 'Date',
                    literal: undefined,
                };
                return type;
            }
            if (tsType.flags & ts.TypeFlags.Object && tsType.symbol.flags & ts.SymbolFlags.TypeLiteral) {
                const type: InterfaceType = {
                    id: id++,
                    kind: 'interface',
                    name: 'anonymous',
                    doc: getDoc(symbol),
                    members: checker.getPropertiesOfType(tsType).map(createProp),
                };
                types.set(tsType, type);
                return type;
            }

            type = { id: id++ } as AllTypes;
            types.set(tsType, type);
            return type;
        }
        function getDoc(symbol: ts.Symbol | undefined) {
            if (!symbol) return;
            const doc = symbol.getDocumentationComment(checker);
            if (doc.length > 0) return doc[0].text;
        }
        function createProp(symbol: ts.Symbol): Prop {
            const tsType = getTypeFromSymbol(symbol);

            const signature = checker.getSignaturesOfType(tsType, ts.SignatureKind.Call)[0];
            let paramsType;
            if (signature) {
                const paramsArgSymbol = signature.parameters[0];
                if (paramsArgSymbol) {
                    paramsType = getTypeFromSymbol(paramsArgSymbol);
                }
            }

            const retType = signature ? signature.getReturnType() : tsType;
            const declNode = (symbol.declarations[0] as ts.PropertySignature).type!;
            let rawType = declNode.getText();
            let defaultValue;
            if (
                ts.isTypeReferenceNode(declNode) &&
                ts.isIdentifier(declNode.typeName) &&
                declNode.typeName.text === 'Default'
            ) {
                const defaultValueNode = declNode.typeArguments![1];
                if (ts.isLiteralTypeNode(defaultValueNode)) {
                    if (ts.isStringLiteral(defaultValueNode.literal) || ts.isNumericLiteral(defaultValueNode.literal)) {
                        defaultValue = defaultValueNode.literal.text;
                    }
                    if (defaultValueNode.literal.kind === ts.SyntaxKind.TrueKeyword) {
                        defaultValue = true;
                    }
                    if (defaultValueNode.literal.kind === ts.SyntaxKind.FalseKeyword) {
                        defaultValue = false;
                    }
                }
                rawType = declNode.typeArguments![0].getText();
            }
            return {
                name: symbol.name,
                doc: getDoc(symbol),
                type: getType(retType, rawType),
                defaultValue: defaultValue,
                args: paramsType ? paramsType.getProperties().map(createProp) : undefined,
                optional: (symbol.flags & ts.SymbolFlags.Optional) > 0 || retType.getNonNullableType() !== retType,
            };
        }

        function getTypeFromSymbol(symbol: ts.Symbol) {
            return checker.getTypeOfSymbolAtLocation(symbol, symbol.declarations[0]);
        }
        function visitor(node: ts.Node) {
            if (ts.isInterfaceDeclaration(node)) {
                const tsType = checker.getTypeAtLocation(node);
                // const tsType = checker.getTypeOfSymbolAtLocation(symbol, symbol.declarations[0]);
                const type = getType(tsType) as InterfaceType;
                type.doc = getDoc(tsType.symbol);
                type.kind = 'interface';
                type.name = node.name.text;
                type.members = [];
                const symbols = checker.getPropertiesOfType(tsType);
                for (let i = 0; i < symbols.length; i++) {
                    const symbol = symbols[i];
                    type.members.push(createProp(symbol));
                }
            }
            if (ts.isTypeAliasDeclaration(node)) {
                if (ts.isUnionTypeNode(node.type)) {
                    const tsType = checker.getTypeAtLocation(node.type);
                    const type = getType(tsType) as UnionType;
                    type.doc = getDoc(tsType.aliasSymbol!);
                    type.kind = 'union';
                    type.name = node.name.text;
                    type.members = node.type.types.map(typeNode => getType(checker.getTypeFromTypeNode(typeNode)));
                }
            }
        }
        ts.forEachChild(sourceFile, visitor);
        return [...types.values()];
    };
}
