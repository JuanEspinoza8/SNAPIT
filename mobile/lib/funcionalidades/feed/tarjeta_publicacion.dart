import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../compartido/formato/fechas.dart';
import '../../compartido/rutas/rutas_app.dart';
import '../../compartido/tema/tema_app.dart';
import '../mapa/derivado_a.dart';
import '../mapa/estados.dart';
import '../mapa/modelos.dart';
import 'carrusel_fotos.dart';
import 'modelos.dart';
import 'widgets_social.dart';

/// Un reporte publicado en el feed, como un posteo: quién lo hizo, la foto,
/// el me gusta y los comentarios, qué problema es y a qué área se derivó.
/// Abajo, la línea a su incidente: el problema en general, con su estado y
/// cuántos vecinos lo reportaron. Si se resolvió, lo dice arriba.
///
/// Toda la tarjeta abre la publicación, salvo lo que ya hace otra cosa (el me
/// gusta, los comentarios, la línea al problema). Cuando pasa por el medio de
/// la pantalla al scrollear, se agranda apenas.
class TarjetaPublicacion extends StatelessWidget {
  const TarjetaPublicacion(this.publicacion, {super.key});

  final Publicacion publicacion;

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    final p = publicacion;
    final secundario = tema.textTheme.bodySmall?.copyWith(
      color: tema.colorScheme.onSurfaceVariant,
    );
    final comentarios = p.cantidadComentarios;
    void abrir() => context.push(Rutas.reporte(p.id));

    return _AgrandarAlPasar(
      child: Card(
        margin: const EdgeInsets.symmetric(
          horizontal: Espacio.md,
          vertical: Espacio.sm,
        ),
        clipBehavior: Clip.antiAlias,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(radioBorde),
          side: BorderSide(color: tema.colorScheme.outline),
        ),
        child: InkWell(
          onTap: abrir,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.all(Espacio.md),
                child: Row(
                  children: [
                    AvatarAutor(p.autor, radio: 18),
                    const SizedBox(width: Espacio.md),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            p.autor.nombre,
                            style: tema.textTheme.labelLarge,
                          ),
                          Text(
                            [haceCuanto(p.creadoEn), ?p.direccion].join(' · '),
                            style: secundario,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                      ),
                    ),
                    if (p.resuelto) ...[
                      const SizedBox(width: Espacio.sm),
                      const EtiquetaEstado(EstadoVisible.resuelto),
                    ],
                  ],
                ),
              ),
              CarruselFotos(
                fotoIds: p.fotoIds,
                descripcion:
                    '${p.categoriaNombre}, reporte del ${p.autor.nombre}',
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  Espacio.sm,
                  Espacio.xs,
                  Espacio.lg,
                  0,
                ),
                child: Row(
                  children: [
                    BotonMeGusta(p),
                    TextButton.icon(
                      onPressed: abrir,
                      icon: Icon(
                        Icons.chat_bubble_outline,
                        color: tema.colorScheme.onSurfaceVariant,
                      ),
                      label: Text(
                        '$comentarios',
                        semanticsLabel: comentarios == 1
                            ? 'Ver 1 comentario'
                            : 'Ver $comentarios comentarios',
                      ),
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  Espacio.lg,
                  0,
                  Espacio.lg,
                  Espacio.lg,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Wrap(
                      spacing: Espacio.sm,
                      runSpacing: Espacio.sm,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        Text(
                          p.categoriaNombre,
                          style: tema.textTheme.titleMedium,
                        ),
                        EtiquetaGravedad(p.gravedad),
                      ],
                    ),
                    if (p.derivadoA != null) ...[
                      const SizedBox(height: Espacio.sm),
                      DerivadoA(p.derivadoA),
                    ],
                    if (p.descripcion case final descripcion?
                        when descripcion.trim().isNotEmpty) ...[
                      const SizedBox(height: Espacio.sm),
                      Text(descripcion),
                    ],
                    const SizedBox(height: Espacio.md),
                    _LineaAlProblema(p),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// «3 vecinos reportaron este problema · En ejecución»: lleva a la ficha del
/// incidente, que junta sus reportes. Con uno solo, solo el estado.
class _LineaAlProblema extends StatelessWidget {
  const _LineaAlProblema(this.publicacion);

  final Publicacion publicacion;

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    final vecinos = publicacion.cantidadVecinos;
    // Con un solo vecino, todo el problema ya está en la publicación: solo
    // dice en qué estado está.
    if (vecinos <= 1) {
      return Wrap(
        spacing: Espacio.sm,
        runSpacing: Espacio.xs,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          Text(
            'Estado del problema',
            style: tema.textTheme.bodySmall?.copyWith(
              color: tema.colorScheme.onSurfaceVariant,
            ),
          ),
          EtiquetaEstado(publicacion.estadoIncidente),
        ],
      );
    }
    return Material(
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(radioBorde),
        side: BorderSide(color: tema.colorScheme.outline),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => context.push(Rutas.incidente(publicacion.incidenteId)),
        child: Padding(
          padding: const EdgeInsets.all(Espacio.md),
          child: Row(
            children: [
              Icon(Icons.link, size: 18, color: tema.colorScheme.primary),
              const SizedBox(width: Espacio.sm),
              Expanded(
                child: Text(
                  '$vecinos vecinos reportaron este problema',
                  style: tema.textTheme.bodySmall,
                ),
              ),
              const SizedBox(width: Espacio.sm),
              EtiquetaEstado(publicacion.estadoIncidente),
            ],
          ),
        ),
      ),
    );
  }
}

/// Se agranda apenas mientras pasa por el medio de la pantalla al scrollear.
/// Con las animaciones apagadas en el celular, se queda quieto.
class _AgrandarAlPasar extends StatefulWidget {
  const _AgrandarAlPasar({required this.child});

  final Widget child;

  @override
  State<_AgrandarAlPasar> createState() => _AgrandarAlPasarState();
}

class _AgrandarAlPasarState extends State<_AgrandarAlPasar> {
  ScrollPosition? _posicion;
  var _enElCentro = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final posicion = Scrollable.maybeOf(context)?.position;
    if (posicion == _posicion) return;
    _posicion?.removeListener(_medir);
    _posicion = posicion?..addListener(_medir);
    WidgetsBinding.instance.addPostFrameCallback((_) => _medir());
  }

  @override
  void dispose() {
    _posicion?.removeListener(_medir);
    super.dispose();
  }

  /// Si el centro de la tarjeta cae en el 40 % del medio de la lista.
  void _medir() {
    if (!mounted) return;
    final caja = context.findRenderObject();
    final lista = Scrollable.maybeOf(context)?.context.findRenderObject();
    if (caja is! RenderBox || lista is! RenderBox) return;
    if (!caja.attached || !caja.hasSize || !lista.hasSize) return;
    final centro = caja.localToGlobal(caja.size.center(Offset.zero)).dy;
    final medio = lista.localToGlobal(lista.size.center(Offset.zero)).dy;
    final enElCentro = (centro - medio).abs() < lista.size.height * 0.2;
    if (enElCentro != _enElCentro) setState(() => _enElCentro = enElCentro);
  }

  @override
  Widget build(BuildContext context) {
    if (MediaQuery.disableAnimationsOf(context)) return widget.child;
    return AnimatedScale(
      scale: _enElCentro ? 1.015 : 1,
      duration: const Duration(milliseconds: 250),
      curve: Curves.easeOut,
      child: widget.child,
    );
  }
}
