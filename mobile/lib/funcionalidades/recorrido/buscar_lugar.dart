import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../compartido/errores/mensaje_error.dart';
import '../../compartido/red/error_api.dart';
import '../../compartido/tema/tema_app.dart';
import 'modelos.dart';
import 'repositorio_recorrido.dart';

/// Hoja para buscar una dirección o un lugar de Neuquén Capital. Devuelve el
/// lugar elegido o null si se cierra sin elegir.
Future<LugarEncontrado?> buscarLugar(
  BuildContext context, {
  required String titulo,
}) {
  return showModalBottomSheet<LugarEncontrado>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => _BuscarLugar(titulo: titulo),
  );
}

class _BuscarLugar extends ConsumerStatefulWidget {
  const _BuscarLugar({required this.titulo});

  final String titulo;

  @override
  ConsumerState<_BuscarLugar> createState() => _BuscarLugarState();
}

class _BuscarLugarState extends ConsumerState<_BuscarLugar> {
  final _texto = TextEditingController();

  /// El texto que se buscó. Null hasta la primera búsqueda.
  String? _buscado;
  String? _aviso;

  @override
  void dispose() {
    _texto.dispose();
    super.dispose();
  }

  // Se busca al confirmar y no con cada letra: el servidor consulta a
  // Nominatim, que admite una consulta por segundo.
  void _buscar() {
    final texto = _texto.text.trim();
    if (texto.length < 3) {
      setState(() => _aviso = 'Escribí al menos 3 letras');
      return;
    }
    // Con el mismo texto, el provider guarda la falla anterior: hay que
    // descartarla para que "Buscar" vuelva a consultar.
    if (texto == _buscado && ref.read(lugaresProvider(texto)).hasError) {
      ref.invalidate(lugaresProvider(texto));
    }
    setState(() {
      _aviso = null;
      _buscado = texto;
    });
  }

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    final busqueda = switch (_buscado) {
      final texto? => ref.watch(lugaresProvider(texto)),
      null => null,
    };
    return Padding(
      // La hoja sube con el teclado.
      padding: EdgeInsets.only(
        left: Espacio.lg,
        right: Espacio.lg,
        bottom: MediaQuery.viewInsetsOf(context).bottom + Espacio.lg,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(widget.titulo, style: tema.textTheme.titleMedium),
          const SizedBox(height: Espacio.md),
          TextField(
            controller: _texto,
            autofocus: true,
            textInputAction: TextInputAction.search,
            onSubmitted: (_) => _buscar(),
            decoration: InputDecoration(
              labelText: 'Dirección o lugar',
              hintText: 'Por ejemplo, Saavedra 500',
              helperText: 'Se busca solo en Neuquén Capital.',
              errorText: _aviso,
            ),
          ),
          const SizedBox(height: Espacio.md),
          FilledButton.icon(
            onPressed: _buscar,
            icon: const Icon(Icons.search),
            label: const Text('Buscar'),
          ),
          if (busqueda != null)
            Padding(
              padding: const EdgeInsets.only(top: Espacio.lg),
              child: switch (busqueda) {
                AsyncValue(:final error?) => MensajeError(
                  ErrorApi.desde(error).mensaje,
                ),
                AsyncValue(:final value?) when value.isEmpty => Semantics(
                  liveRegion: true,
                  child: const Text(
                    'No encontramos ese lugar en Neuquén. Probá escribirlo de '
                    'otra forma o marcá el punto en el mapa.',
                  ),
                ),
                AsyncValue(:final value?) => _Resultados(value),
                _ => Semantics(
                  liveRegion: true,
                  label: 'Buscando',
                  child: const LinearProgressIndicator(),
                ),
              },
            ),
        ],
      ),
    );
  }
}

class _Resultados extends StatelessWidget {
  const _Resultados(this.lugares);

  final List<LugarEncontrado> lugares;

  @override
  Widget build(BuildContext context) {
    return ConstrainedBox(
      // Con el teclado abierto la lista no tapa el campo: se desplaza.
      constraints: BoxConstraints(
        maxHeight: MediaQuery.sizeOf(context).height * 0.4,
      ),
      child: ListView(
        shrinkWrap: true,
        children: [
          Semantics(
            liveRegion: true,
            child: Text(
              lugares.length == 1
                  ? '1 resultado'
                  : '${lugares.length} resultados',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ),
          for (final lugar in lugares)
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.place_outlined),
              title: Text(lugar.nombre),
              onTap: () => Navigator.of(context).pop(lugar),
            ),
        ],
      ),
    );
  }
}
