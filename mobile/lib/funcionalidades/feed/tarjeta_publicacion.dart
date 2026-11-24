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

/// Un reporte publicado en el feed, como un posteo: quién lo hizo, hace
/// cuánto y dónde, lo que cuenta y la foto; el me gusta y los comentarios;
/// qué problema es y a qué área le corresponde; y abajo, el estado del
/// problema y cuántos vecinos lo reportaron. Si se resolvió, lo dice arriba.
///
/// Va en niveles, para que no quede plana: la tarjeta, la barra de acciones,
/// el panel del problema y la franja del estado tienen cada uno su tono.
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
    final esquema = tema.colorScheme;
    final p = publicacion;
    final secundario = tema.textTheme.bodySmall?.copyWith(
      color: esquema.onSurfaceVariant,
    );
    final comentarios = p.cantidadComentarios;
    void abrir() => context.push(Rutas.reporte(p.id));
    final niveles = NivelesTarjeta.de(context);

    return _AgrandarAlPasar(
      child: Card(
        margin: const EdgeInsets.symmetric(
          horizontal: Espacio.md,
          vertical: Espacio.sm,
        ),
        clipBehavior: Clip.antiAlias,
        color: niveles.tarjeta,
        elevation: 1.5,
        shadowColor: Colors.black.withValues(alpha: 0.25),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(radioBorde),
          side: BorderSide(color: niveles.borde),
        ),
        child: InkWell(
          onTap: abrir,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Nivel 1: quién, hace cuánto, dónde, qué cuenta y la foto.
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  Espacio.md,
                  Espacio.md,
                  Espacio.md,
                  Espacio.sm,
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    AvatarAutor(p.autor, radio: 20),
                    const SizedBox(width: Espacio.md),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          // El nombre, hace cuánto y «Resuelto»: con letra
                          // grande bajan a otra línea en vez de desbordarse.
                          Wrap(
                            spacing: Espacio.sm,
                            runSpacing: Espacio.xs,
                            crossAxisAlignment: WrapCrossAlignment.center,
                            children: [
                              Text(
                                p.autor.nombre,
                                style: tema.textTheme.titleSmall?.copyWith(
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                              Text(haceCuanto(p.creadoEn), style: secundario),
                              if (p.resuelto)
                                const EtiquetaEstado(EstadoVisible.resuelto),
                            ],
                          ),
                          if (p.direccion case final direccion?)
                            Row(
                              children: [
                                Icon(
                                  Icons.location_on_outlined,
                                  size: 15,
                                  color: esquema.onSurfaceVariant,
                                ),
                                const SizedBox(width: Espacio.xs),
                                Expanded(
                                  child: Text(
                                    direccion,
                                    style: secundario,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                              ],
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              if (p.descripcion case final descripcion?
                  when descripcion.trim().isNotEmpty)
                Padding(
                  padding: const EdgeInsets.fromLTRB(
                    Espacio.md,
                    0,
                    Espacio.md,
                    Espacio.md,
                  ),
                  child: Text(descripcion, style: tema.textTheme.bodyLarge),
                ),
              CarruselFotos(
                fotoIds: p.fotoIds,
                descripcion:
                    '${p.categoriaNombre}, reporte del ${p.autor.nombre}',
              ),
              // Nivel 2: la barra de acciones, una franja con el fondo de la
              // pantalla entre la foto y el detalle.
              DecoratedBox(
                decoration: BoxDecoration(
                  color: niveles.panel,
                  border: Border.symmetric(
                    horizontal: BorderSide(color: niveles.borde),
                  ),
                ),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: Espacio.sm),
                  child: Row(
                    children: [
                      BotonMeGusta(p),
                      TextButton.icon(
                        onPressed: abrir,
                        icon: Icon(
                          Icons.chat_bubble_outline,
                          color: esquema.onSurfaceVariant,
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
              ),
              // Nivel 3: el problema, en un panel con su propio fondo y borde.
              Padding(
                padding: const EdgeInsets.all(Espacio.md),
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    color: niveles.panel,
                    borderRadius: BorderRadius.circular(radioBorde),
                    border: Border.all(color: niveles.borde),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.all(Espacio.md),
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
                          Row(
                            children: [
                              Icon(
                                Icons.apartment_outlined,
                                size: 16,
                                color: esquema.onSurfaceVariant,
                              ),
                              const SizedBox(width: Espacio.xs),
                              Expanded(child: DerivadoA(p.derivadoA)),
                            ],
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
              ),
              // Abajo, el estado en una franja más marcada.
              DecoratedBox(
                decoration: BoxDecoration(
                  color: niveles.pie,
                  border: Border(top: BorderSide(color: niveles.borde)),
                ),
                child: _LineaAlProblema(p),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Los tonos de los niveles de una tarjeta: el texto mezclado sobre el fondo
/// en distinta medida. En el tema claro cada nivel es un poco más oscuro; en
/// el oscuro, un poco más claro. Así no hacen falta colores nuevos en la
/// paleta.
class NivelesTarjeta {
  const NivelesTarjeta._(this.panel, this.tarjeta, this.pie, this.borde);

  factory NivelesTarjeta.de(BuildContext context) {
    final esquema = Theme.of(context).colorScheme;
    Color nivel(double cuanto) => Color.alphaBlend(
      esquema.onSurface.withValues(alpha: cuanto),
      esquema.surface,
    );
    return NivelesTarjeta._(
      esquema.surface,
      nivel(0.035),
      nivel(0.07),
      nivel(0.16),
    );
  }

  /// La barra de acciones y el panel del problema: el fondo de la pantalla.
  final Color panel;

  /// La tarjeta, un poco distinta del fondo.
  final Color tarjeta;

  /// La franja del estado, la más marcada.
  final Color pie;

  /// Los bordes entre un nivel y otro.
  final Color borde;
}

/// «3 vecinos reportaron este problema · En ejecución»: lleva a la ficha del
/// incidente, que junta sus reportes. Con un solo vecino, todo el problema ya
/// está en la publicación: solo dice en qué estado está.
class _LineaAlProblema extends StatelessWidget {
  const _LineaAlProblema(this.publicacion);

  final Publicacion publicacion;

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    final vecinos = publicacion.cantidadVecinos;
    final varios = vecinos > 1;
    final contenido = Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: Espacio.lg,
        vertical: Espacio.md,
      ),
      // Con letra grande, el estado baja a otra línea en vez de desbordarse.
      child: Row(
        children: [
          if (varios) ...[
            Icon(
              Icons.groups_outlined,
              size: 18,
              color: tema.colorScheme.onSurfaceVariant,
            ),
            const SizedBox(width: Espacio.sm),
          ],
          Expanded(
            child: Wrap(
              spacing: Espacio.sm,
              runSpacing: Espacio.xs,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                Text(
                  varios
                      ? '$vecinos vecinos reportaron este problema'
                      : 'Estado del problema',
                  style: tema.textTheme.bodySmall?.copyWith(
                    color: tema.colorScheme.onSurfaceVariant,
                  ),
                ),
                EtiquetaEstado(publicacion.estadoIncidente),
              ],
            ),
          ),
          if (varios)
            Icon(
              Icons.chevron_right,
              size: 20,
              color: tema.colorScheme.onSurfaceVariant,
            ),
        ],
      ),
    );
    if (!varios) return contenido;
    return Material(
      type: MaterialType.transparency,
      child: InkWell(
        onTap: () => context.push(Rutas.incidente(publicacion.incidenteId)),
        child: contenido,
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
