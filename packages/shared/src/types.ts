// PlayerId is a documentation alias. We intentionally don't brand it: branded
// types add friction at every test/JSON/load boundary without buying real
// safety here, since players are identified by user-supplied strings anyway.
export type PlayerId = string;
export type TerritoryName = string;
export type ContinentId = string;
