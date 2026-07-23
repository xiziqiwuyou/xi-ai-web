export function createKnowledgeSchemaRepository(queryable) {
  if (!queryable || typeof queryable.query !== "function") {
    throw new TypeError("Knowledge schema repository requires a queryable database client");
  }

  return Object.freeze({
    async ping() {
      const result = await queryable.query("SELECT 1 AS ok");
      return result.rows?.[0]?.ok === 1;
    },

    async vectorExtensionVersion() {
      const result = await queryable.query(
        "SELECT extversion FROM pg_extension WHERE extname = 'vector'"
      );
      return result.rows?.[0]?.extversion || null;
    }
  });
}
