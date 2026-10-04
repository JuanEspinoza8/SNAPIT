import 'package:flutter/material.dart';

import '../red/error_api.dart';

/// Muestra el mensaje del error en un aviso al pie de la pantalla.
void mostrarError(BuildContext context, Object error) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(ErrorApi.desde(error).mensaje)));
}
