import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:speech_to_text/speech_to_text.dart';

import '../../compartido/errores/aviso_error.dart';
import '../../compartido/red/error_api.dart';
import '../../compartido/rutas/rutas_app.dart';
import '../../compartido/sesion/sesion.dart';
import '../../compartido/tema/tema_app.dart';
import 'consulta_interpretada.dart';
import 'filtros_interpretados.dart';
import 'filtros_mapa.dart';
import 'modelos.dart';

class BarraConsulta extends ConsumerStatefulWidget {
  const BarraConsulta({
    super.key,
    required this.filtrosActuales,
    required this.alAplicar,
  });

  final FiltrosMapa filtrosActuales;
  final ValueChanged<FiltrosMapa> alAplicar;

  @override
  ConsumerState<BarraConsulta> createState() => _BarraConsultaState();
}

class _BarraConsultaState extends ConsumerState<BarraConsulta> {
  final _controlador = TextEditingController();
  final _voz = SpeechToText();
  var _vozLista = false;
  var _escuchando = false;
  var _interpretando = false;
  String? _errorVoz;

  @override
  void dispose() {
    unawaited(_voz.stop());
    _controlador.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    final conSesion = ref.watch(sesionProvider).value != null;

    return DecoratedBox(
      decoration: BoxDecoration(
        color: tema.colorScheme.surfaceContainerLow,
        border: Border(bottom: BorderSide(color: tema.colorScheme.outline)),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: Espacio.lg,
          vertical: Espacio.sm,
        ),
        child: TextField(
          controller: _controlador,
          enabled: !_interpretando,
          readOnly: !conSesion || _interpretando,
          maxLength: 500,
          textInputAction: TextInputAction.search,
          onSubmitted: conSesion && !_interpretando
              ? (_) => _consultar()
              : null,
          onTap: !conSesion && !_interpretando
              ? () => context.go(Rutas.ingreso)
              : null,
          decoration: InputDecoration(
            labelText: conSesion
                ? 'Consultar en lenguaje natural'
                : 'Ingresá para consultar en lenguaje natural',
            hintText: conSesion ? 'Ej.: pozos en el centro este mes' : null,
            errorText: _errorVoz,
            counterText: '',
            prefixIcon: const Icon(Icons.search),
            suffixIcon: conSesion
                ? Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      IconButton(
                        tooltip: _escuchando
                            ? 'Detener dictado'
                            : 'Dictar consulta',
                        icon: Icon(
                          _escuchando ? Icons.stop : Icons.mic,
                        ),
                        onPressed: _interpretando ? null : _dictar,
                      ),
                      IconButton(
                        tooltip: 'Buscar',
                        icon: const Icon(Icons.arrow_forward),
                        onPressed: _interpretando ? null : _consultar,
                      ),
                    ],
                  )
                : null,
          ),
        ),
      ),
    );
  }

  Future<void> _consultar() async {
    final texto = _controlador.text.trim();
    if (texto.isEmpty || _interpretando || _escuchando) return;

    FocusScope.of(context).unfocus();
    setState(() => _interpretando = true);

    try {
      final consulta = await ref
          .read(repositorioConsultasProvider)
          .interpretar(texto);
      if (!mounted) return;

      final filtros = await elegirFiltrosInterpretados(context, consulta);
      if (filtros != null && mounted) {
        _controlador.clear();
        widget.alAplicar(filtros);
      }
    } on ErrorApi catch (e) {
      if (!mounted) return;
      mostrarError(context, e);
      if (e.status == 401) return;

      final filtros = await elegirFiltros(context, widget.filtrosActuales);
      if (filtros != null && mounted) widget.alAplicar(filtros);
    } finally {
      if (mounted) setState(() => _interpretando = false);
    }
  }

  Future<void> _dictar() async {
    if (_escuchando) {
      await _voz.stop();
      if (mounted) setState(() => _escuchando = false);
      return;
    }

    setState(() => _errorVoz = null);

    if (!_vozLista) {
      _vozLista = await _voz.initialize(
        onError: (error) {
          if (!mounted) return;
          setState(() {
            _escuchando = false;
            _errorVoz = error.errorMsg.contains('permission')
                ? 'El micrófono está denegado. Habilitá el permiso o escribí '
                    'la consulta.'
                : 'No se pudo usar el micrófono. Escribí la consulta.';
          });
        },
        onStatus: (estado) {
          if (!mounted) return;
          if (estado == SpeechToText.doneStatus ||
              estado == SpeechToText.notListeningStatus) {
            setState(() => _escuchando = false);
          }
        },
      );
    }

    if (!_vozLista) {
      if (mounted) {
        setState(() {
          _errorVoz = 'No se pudo usar el micrófono. Escribí la consulta.';
        });
      }
      return;
    }

    setState(() => _escuchando = true);
    try {
      await _voz.listen(
        onResult: (result) {
          if (!mounted) return;
          setState(() => _controlador.text = result.recognizedWords);
        },
        listenOptions: SpeechListenOptions(
          listenMode: ListenMode.dictation,
          partialResults: true,
          cancelOnError: true,
          listenFor: const Duration(seconds: 20),
          pauseFor: const Duration(seconds: 3),
        ),
      );
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _escuchando = false;
        _errorVoz = 'No se pudo iniciar el dictado. Escribí la consulta.';
      });
    }
  }
}