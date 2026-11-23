ALTER TABLE reporte
  ADD CONSTRAINT reporte_usuario_registro_unico UNIQUE (usuario_id, registrado_en);
