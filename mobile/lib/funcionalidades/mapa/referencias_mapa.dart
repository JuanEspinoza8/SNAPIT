import 'package:flutter/material.dart';

import '../../compartido/tema/tema_app.dart';
import 'estados.dart';
import 'modelos.dart';

/// Qué quiere decir cada marcador, con texto.
Future<void> mostrarReferencias(BuildContext context) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    showDragHandle: true,
    builder: (hoja) => SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(Espacio.lg, 0, Espacio.lg, Espacio.xl),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Referencias', style: Theme.of(hoja).textTheme.titleMedium),
          const SizedBox(height: Espacio.lg),
          for (final estado in EstadoVisible.values)
            _Fila(
              marca: MarcaEstado(estado, tamanio: 28),
              texto: estado.etiqueta,
            ),
          const _Fila(
            marca: MarcaGrupo(3),
            texto:
                'Varios incidentes juntos: tocalo para acercar el mapa o, si '
                'están en el mismo lugar, para ver la lista',
          ),
        ],
      ),
    ),
  );
}

class _Fila extends StatelessWidget {
  const _Fila({required this.marca, required this.texto});

  final Widget marca;
  final String texto;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: Espacio.md),
      child: Row(
        children: [
          SizedBox(
            width: altoTactil,
            child: Center(child: ExcludeSemantics(child: marca)),
          ),
          const SizedBox(width: Espacio.md),
          Expanded(child: Text(texto)),
        ],
      ),
    );
  }
}
