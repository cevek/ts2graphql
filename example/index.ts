import { createSchema } from '../src/createSchema';
import { printSchema } from 'graphql';

const schema = createSchema(__dirname + '/test.ts');
console.log(printSchema(schema));
