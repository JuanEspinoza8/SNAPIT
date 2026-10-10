import 'package:flutter/material.dart';

import '../../compartido/formato/fechas.dart';
import '../../compartido/tema/tema_app.dart';
import 'estados.dart';
import 'ficha_incidente.dart';
import 'modelos.dart';

/// Varios incidentes en el mismo lugar: se elige cuál ver.
Future<void> mostrarListaIncidentes(
  BuildContext context,
  List<PuntoMapa> puntos,
) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    showDragHandle: true,
    builder: (hoja) => Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: Espacio.lg),
          child: Text(
            '${puntos.length} incidentes en este lugar',
            style: Theme.of(hoja).textTheme.titleMedium,
          ),
        ),
        const SizedBox(height: Espacio.sm),
        Flexible(
          child: ListView(
            shrinkWrap: true,
            padding: const EdgeInsets.only(bottom: Espacio.lg),
            children: [
              for (final punto in puntos)
                ListTile(
                  title: Text(punto.categoriaNombre),
                  subtitle: Text(
                    'Primer reporte: ${fechaLarga(punto.primerReporteEn)}',
                  ),
                  trailing: EtiquetaEstado(punto.estado),
                  onTap: () {
                    Navigator.of(hoja).pop();
                    mostrarFicha(context, punto.id);
                  },
                ),
            ],
          ),
        ),
      ],
    ),
  );
}
