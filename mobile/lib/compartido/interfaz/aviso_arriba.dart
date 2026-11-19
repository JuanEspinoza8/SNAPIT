import 'dart:async';

import 'package:flutter/material.dart';

import '../tema/tema_app.dart';

/// El aviso que se está mostrando: uno nuevo reemplaza al anterior.
OverlayEntry? _actual;

/// Un aviso corto arriba de todo, como «Reporte enviado»: baja desde arriba,
/// se va solo a los pocos segundos, y se puede cerrar tocándolo o
/// deslizándolo hacia arriba. Va sobre la capa raíz, así que sigue a la vista
/// aunque se cambie de pantalla.
void mostrarAvisoArriba(
  BuildContext context, {
  required String titulo,
  required String texto,
  Duration duracion = const Duration(seconds: 4),
}) {
  // Si su pantalla ya no existe (otra sesión de la app, un test anterior), no
  // hay nada que sacar.
  if (_actual case final anterior? when anterior.mounted) anterior.remove();
  final capa = Overlay.of(context, rootOverlay: true);
  late final OverlayEntry entrada;
  entrada = OverlayEntry(
    builder: (_) => _AvisoArriba(
      titulo: titulo,
      texto: texto,
      duracion: duracion,
      alIrse: () {
        if (!entrada.mounted) return;
        entrada.remove();
        if (identical(_actual, entrada)) _actual = null;
      },
    ),
  );
  _actual = entrada;
  capa.insert(entrada);
}

class _AvisoArriba extends StatefulWidget {
  const _AvisoArriba({
    required this.titulo,
    required this.texto,
    required this.duracion,
    required this.alIrse,
  });

  final String titulo;
  final String texto;
  final Duration duracion;
  final VoidCallback alIrse;

  @override
  State<_AvisoArriba> createState() => _AvisoArribaState();
}

class _AvisoArribaState extends State<_AvisoArriba>
    with SingleTickerProviderStateMixin {
  late final _animacion = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 250),
  )..forward();
  Timer? _temporizador;

  @override
  void initState() {
    super.initState();
    _temporizador = Timer(widget.duracion, _cerrar);
  }

  @override
  void dispose() {
    _temporizador?.cancel();
    _animacion.dispose();
    super.dispose();
  }

  Future<void> _cerrar() async {
    _temporizador?.cancel();
    if (!mounted) return;
    await _animacion.reverse();
    widget.alIrse();
  }

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    final curva = CurvedAnimation(parent: _animacion, curve: Curves.easeOut);
    return SafeArea(
      child: Align(
        alignment: Alignment.topCenter,
        child: Padding(
          padding: const EdgeInsets.all(Espacio.md),
          child: SlideTransition(
            position: Tween(
              begin: const Offset(0, -1),
              end: Offset.zero,
            ).animate(curva),
            child: FadeTransition(
              opacity: curva,
              child: Dismissible(
                key: const ValueKey('aviso-arriba'),
                direction: DismissDirection.up,
                onDismissed: (_) => widget.alIrse(),
                child: Semantics(
                  liveRegion: true,
                  child: Material(
                    elevation: 6,
                    color: tema.colorScheme.surfaceContainerHigh,
                    borderRadius: BorderRadius.circular(Espacio.xl),
                    child: InkWell(
                      borderRadius: BorderRadius.circular(Espacio.xl),
                      onTap: _cerrar,
                      child: Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: Espacio.lg,
                          vertical: Espacio.md,
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(
                              Icons.check_circle,
                              color: tema.extension<ColoresEstado>()?.resuelto,
                            ),
                            const SizedBox(width: Espacio.md),
                            Flexible(
                              child: Column(
                                mainAxisSize: MainAxisSize.min,
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    widget.titulo,
                                    style: tema.textTheme.titleSmall,
                                  ),
                                  Text(
                                    widget.texto,
                                    style: tema.textTheme.bodySmall,
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
