import {GraphQLScalarType, Kind, GraphQLError} from 'graphql';

export const DateType = new GraphQLScalarType({
    name: 'Date',
    serialize: (date) => {
        if (!(date instanceof Date)) {
            throw new Error("Date object expected")
        }
        else {
            if (Number.isNaN(date.getTime())) {
                throw new Error('Invalid response date');
            }
            return date.toJSON();
        }
    },
    parseValue: val => {
        if (typeof val === "string") return parse(val);
        else throw new Error("String value expected.")
    },
    parseLiteral(ast) {
        if (ast.kind === Kind.STRING) {
            return parse(ast.value);
        }
        return null;
    },
});

function parse(val: string) {
    const date = new Date(val);
    if (val.length !== 24 || Number.isNaN(date.getTime())) {
        throw new GraphQLError('Incorrect Date: ' + val);
    }
    return date;
}
