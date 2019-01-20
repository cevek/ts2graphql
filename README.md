# ts2graphql

This tool converts your typescript interfaces to graphql schema.

// schema.ts

```ts
import { ID, Int, Float } from 'ts2graphql';
interface Query {
    getByAuthor?(args: { id: ID }): Author;
}

interface Author {
    id: ID;
    name: string;
    books(filter: { max?: Int }): Book[];
}

type Book = PDFBook | AudioBook;

interface BookBase {
    /** The authors of this content */
    authors: Author[];
    name: string;
    publishedAt: Date;
    illustrator?: {
        __typename: 'Illustrator';
        name: string;
        email: string;
    };
}

interface PDFBook extends BookBase {
    file: string;
}

interface AudioBook extends BookBase {
    audioFile: string;
}
```

// index.ts
```ts
import { printSchema } from 'graphql';
import { createSchema } from 'ts2graphql';

const schema = createSchema(__dirname + '/schema.ts');
const rootValue = {}; // you should implement resolve methods
express.use(
    '/api/graphql',
    graphqlHTTP({
        schema: schema,
        rootValue: rootValue,
    })
);

console.log(printSchema(schema));
```
will generate schema
```graphql
type AudioBook {
  audioFile: String!

  """The authors of this content"""
  authors: [Author!]!
  name: String!
  publishedAt: Date!
  illustrator: Illustrator
}

type Author {
  id: ID!
  name: String!
  books(max: Int): [Book!]!
}

union Book = PDFBook | AudioBook

scalar Date

type Illustrator {
  __typename: String!
  name: String!
  email: String!
}

type PDFBook {
  file: String!

  """The authors of this content"""
  authors: [Author!]!
  name: String!
  publishedAt: Date!
  illustrator: Illustrator
}

type Query {
  getByAuthor(id: ID!): Author
}

```
