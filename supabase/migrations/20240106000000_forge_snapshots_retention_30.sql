-- CAMBIO 2 — Retención de snapshots: conservar los últimos 30 por proyecto y
-- borrar los más viejos, EXCEPTO los checkpoints etiquetados por el usuario
-- (trigger='manual'), que se preservan siempre.
--
-- Reemplaza el cap anterior de 50 (que además borraba checkpoints manuales) para
-- que coincida con la poda del cliente en saveSnapshot.
CREATE OR REPLACE FUNCTION cap_forge_snapshots()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM forge_snapshots
  WHERE id IN (
    SELECT id FROM forge_snapshots
    WHERE project_id = NEW.project_id
      AND trigger <> 'manual'
    ORDER BY created_at DESC
    OFFSET 30
  );
  RETURN NEW;
END;
$$;

-- El trigger AFTER INSERT ya existe (cap_snapshots_trigger); apunta a esta
-- función, así que la redefinición de arriba basta.
