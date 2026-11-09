import 'package:flutter/material.dart';

import '../../compartido/tema/tema_app.dart';
import 'carrusel_fotos.dart';

/// Abre [fotoIds] a pantalla completa, empezando por la [inicial]. Siempre
/// con la paleta oscura, como cualquier galería: la foto se ve mejor sobre
/// fondo oscuro.
Future<void> ampliarFotos(
  BuildContext context, {
  required String titulo,
  required List<int> fotoIds,
  required String descripcion,
  int inicial = 0,
}) {
  return Navigator.of(context).push(
    MaterialPageRoute<void>(
      fullscreenDialog: true,
      builder: (_) => Theme(
        data: crearTema(PaletaSnapIt.oscuro),
        child: VisorFotos(
          titulo: titulo,
          fotoIds: fotoIds,
          descripcion: descripcion,
          inicial: inicial,
        ),
      ),
    ),
  );
}

/// Las fotos enteras, una por pantalla, para acercarlas con dos dedos y
/// pasarlas con uno.
class VisorFotos extends StatefulWidget {
  const VisorFotos({
    super.key,
    required this.titulo,
    required this.fotoIds,
    required this.descripcion,
    this.inicial = 0,
  });

  final String titulo;
  final List<int> fotoIds;

  /// De qué son las fotos, para TalkBack: «Bache, antes».
  final String descripcion;
  final int inicial;

  @override
  State<VisorFotos> createState() => _VisorFotosState();
}

class _VisorFotosState extends State<VisorFotos> {
  late final _paginas = PageController(initialPage: widget.inicial);
  late var _actual = widget.inicial;
  var _ampliada = false;

  @override
  void dispose() {
    _paginas.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final fotos = widget.fotoIds;
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.titulo),
        actions: [
          if (fotos.length > 1)
            Padding(
              padding: const EdgeInsets.only(right: Espacio.lg),
              child: Center(child: Text('${_actual + 1} de ${fotos.length}')),
            ),
        ],
      ),
      body: SafeArea(
        child: PageView.builder(
          controller: _paginas,
          // Con la foto ampliada, deslizar la mueve en vez de pasar a otra.
          physics: _ampliada ? const NeverScrollableScrollPhysics() : null,
          itemCount: fotos.length,
          onPageChanged: (pagina) => setState(() => _actual = pagina),
          itemBuilder: (_, i) => _FotoConZoom(
            fotos[i],
            descripcion:
                'Foto ${i + 1} de ${fotos.length} de ${widget.descripcion}',
            alCambiar: (ampliada) => setState(() => _ampliada = ampliada),
          ),
        ),
      ),
    );
  }
}

class _FotoConZoom extends StatefulWidget {
  const _FotoConZoom(
    this.id, {
    required this.descripcion,
    required this.alCambiar,
  });

  final int id;
  final String descripcion;

  /// Avisa cuando la foto pasa a estar ampliada o vuelve a su tamaño.
  final ValueChanged<bool> alCambiar;

  @override
  State<_FotoConZoom> createState() => _FotoConZoomState();
}

class _FotoConZoomState extends State<_FotoConZoom> {
  final _zoom = TransformationController();
  var _ampliada = false;

  @override
  void initState() {
    super.initState();
    _zoom.addListener(_revisarZoom);
  }

  @override
  void dispose() {
    _zoom.dispose();
    super.dispose();
  }

  void _revisarZoom() {
    // Con margen: al volver a su tamaño, la escala puede quedar en 1,0000001.
    final ampliada = _zoom.value.getMaxScaleOnAxis() > 1.01;
    if (ampliada == _ampliada) return;
    _ampliada = ampliada;
    widget.alCambiar(ampliada);
  }

  @override
  Widget build(BuildContext context) {
    return InteractiveViewer(
      transformationController: _zoom,
      minScale: 1,
      maxScale: 4,
      child: FotoIncidente(
        widget.id,
        descripcion: widget.descripcion,
        ajuste: BoxFit.contain,
      ),
    );
  }
}
