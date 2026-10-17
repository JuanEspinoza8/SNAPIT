-- #56: la IA del sistema pasa a ser Claude (Anthropic), por decisión del grupo.
-- Agrega el proveedor para registrar cada llamada en registro_ia con su proveedor real.
-- El mismo cambio está en db/schema.sql: aplicar todas las migraciones tiene que dar ese esquema (lo chequea la CI).
ALTER TYPE proveedor_ia ADD VALUE 'ANTHROPIC';

COMMENT ON COLUMN registro_ia.proveedor IS 'Quién respondió: Anthropic (Claude), Ollama local o Gemini.';
