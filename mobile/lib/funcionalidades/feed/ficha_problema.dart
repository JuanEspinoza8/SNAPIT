import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:latlong2/latlong.dart';

import '../../compartido/errores/aviso_error.dart';
import '../../compartido/formato/fechas.dart';
import '../../compartido/mapa/capa_osm.dart';
import '../../compartido/red/error_api.dart';
import '../../compartido/sesion/sesion.dart';
import '../../compartido/sesion/usuario.dart';
import '../../compartido/tema/tema_app.dart';
import '../avisos/avisos.dart';
import '../avisos/repositorio_avisos.dart';
import '../mapa/derivado_a.dart';
import '../mapa/estados.dart';
import '../mapa/modelos.dart';
import 'confirmaciones.dart';
import 'widgets_social.dart';

// Lo que muestra el problema (el incidente): lo usan su ficha
// (PantallaIncidente) y cada publicación (PantallaReporte), que muestra el
// problema del que forma parte sin tener que ir a otra pantalla.

/// Qué problema es: la categoría, el estado, la gravedad y a qué área se
/// derivó.
class CabeceraProblema extends StatelessWidget {
  const CabeceraProblema(this.ficha, {super.key});

  final FichaIncidente ficha;

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    final secundario = tema.textTheme.bodySmall?.copyWith(
      color: tema.colorScheme.onSurfaceVariant,
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(ficha.categoriaNombre, style: tema.textTheme.titleLarge),
        const SizedBox(height: Espacio.md),
        Wrap(
          spacing: Espacio.sm,
          runSpacing: Espacio.sm,
          children: [
            EtiquetaEstado(ficha.estado),
            if (ficha.gravedad case final gravedad?) EtiquetaGravedad(gravedad),
          ],
        ),
        if (ficha.derivadoA != null) ...[
          const SizedBox(height: Espacio.sm),
          DerivadoA(ficha.derivadoA),
        ],
        if (ficha.enRevision) ...[
          const SizedBox(height: Espacio.sm),
          Text(
            'Todavía no se verificó: puede cambiar de categoría o '
            'descartarse.',
            style: secundario,
          ),
        ],
      ],
    );
  }
}

/// Dónde está, cuándo se reportó, cuántos vecinos y, si se resolvió, cuándo.
class DatosProblema extends StatelessWidget {
  const DatosProblema(this.ficha, {super.key});

  final FichaIncidente ficha;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      if (ficha.direccion case final direccion?)
        _Dato(Icons.place_outlined, 'Dirección', direccion),
      _Dato(
        Icons.event_outlined,
        'Primer reporte',
        fechaLarga(ficha.primerReporteEn),
      ),
      _Dato(
        Icons.group_outlined,
        'Vecinos que lo reportaron',
        '${ficha.cantidadVecinos}',
      ),
      if (ficha.resueltoEn case final resueltoEn?)
        _Dato(Icons.check_circle_outline, 'Resuelto', fechaLarga(resueltoEn)),
    ],
  );
}

/// Sigue o deja de seguir el incidente para recibir sus cambios.
class BotonSeguir extends ConsumerStatefulWidget {
  const BotonSeguir(this.incidenteId, {super.key});

  final int incidenteId;

  @override
  ConsumerState<BotonSeguir> createState() => BotonSeguirState();
}

class BotonSeguirState extends ConsumerState<BotonSeguir> {
  var _enviando = false;

  @override
  Widget build(BuildContext context) {
    final seguimiento = ref.watch(seguimientoProvider(widget.incidenteId));
    // Sin saber si lo sigue, el botón podría decir lo contrario de lo que
    // pasa: mejor decirlo y dejar que vuelva a preguntar.
    if (seguimiento.hasError && !seguimiento.isLoading) {
      return Row(
        children: [
          Expanded(
            child: Text(
              'No se pudo saber si lo seguís.',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
          ),
          TextButton(
            onPressed: () =>
                ref.invalidate(seguimientoProvider(widget.incidenteId)),
            child: const Text('Reintentar'),
          ),
        ],
      );
    }
    final siguiendo = seguimiento.value ?? false;
    final ocupado = seguimiento.isLoading || _enviando;

    return Align(
      alignment: Alignment.centerLeft,
      child: OutlinedButton.icon(
        onPressed: ocupado ? null : _cambiar,
        icon: ocupado
            ? const SizedBox.square(
                dimension: 18,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            : Icon(
                siguiendo
                    ? Icons.notifications_off_outlined
                    : Icons.notifications_none,
              ),
        label: Text(siguiendo ? 'Dejar de seguir' : 'Seguir'),
      ),
    );
  }

  Future<void> _cambiar() async {
    final siguiendo =
        ref.read(seguimientoProvider(widget.incidenteId)).value ?? false;
    final repositorio = ref.read(repositorioAvisosProvider);
    setState(() => _enviando = true);

    try {
      if (siguiendo) {
        await repositorio.dejarDeSeguir(widget.incidenteId);
      } else {
        await repositorio.seguir(widget.incidenteId);
      }
      if (!mounted) return;
      ref.invalidate(seguimientoProvider(widget.incidenteId));
    } catch (error) {
      if (mounted) mostrarError(context, error);
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }
}

/// «Sigue estando» (F12): el vecino confirma, una sola vez, que el problema
/// sigue ahí, y debajo se ve cuántos lo confirmaron. Sin sesión invita a
/// ingresar y después vuelve acá; el operador y el administrador solo ven el
/// contador, porque el servidor no los deja confirmar. No va en un problema
/// resuelto.
class SigueEstando extends ConsumerStatefulWidget {
  const SigueEstando(this.ficha, {super.key});

  final FichaIncidente ficha;

  @override
  ConsumerState<SigueEstando> createState() => _SigueEstandoState();
}

class _SigueEstandoState extends ConsumerState<SigueEstando> {
  var _enviando = false;

  /// El contador que devolvió el servidor al confirmar. Volver a pedir la
  /// ficha para tenerlo pondría toda la pantalla a cargar.
  int? _cantidad;

  int get _incidenteId => widget.ficha.id;

  @override
  void didUpdateWidget(SigueEstando anterior) {
    super.didUpdateWidget(anterior);
    // Una ficha pedida de nuevo ya trae el contador al día.
    if (anterior.ficha != widget.ficha) _cantidad = null;
  }

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    final secundario = tema.textTheme.bodyMedium?.copyWith(
      color: tema.colorScheme.onSurfaceVariant,
    );
    final accion = switch (ref.watch(sesionProvider).value?.rol) {
      null => OutlinedButton.icon(
        onPressed: () => irAlIngreso(context),
        icon: const Icon(Icons.login),
        label: const Text('Ingresá para confirmar que sigue'),
      ),
      Rol.vecino => _accionDelVecino(secundario),
      Rol.operador || Rol.administrador => null,
    };

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (accion != null) ...[accion, const SizedBox(height: Espacio.sm)],
        Text(
          _textoContador(_cantidad ?? widget.ficha.cantidadConfirmaciones),
          style: secundario,
        ),
      ],
    );
  }

  Widget _accionDelVecino(TextStyle? secundario) {
    final confirmacion = ref.watch(confirmacionProvider(_incidenteId));
    // Sin saber si ya confirmó, el botón podría ofrecer algo que el servidor
    // va a rechazar: mejor decirlo y dejar que vuelva a preguntar.
    if (confirmacion.hasError && !confirmacion.isLoading) {
      return Row(
        children: [
          Expanded(
            child: Text(
              'No se pudo saber si ya lo confirmaste.',
              style: secundario,
            ),
          ),
          TextButton(
            onPressed: () => ref.invalidate(confirmacionProvider(_incidenteId)),
            child: const Text('Reintentar'),
          ),
        ],
      );
    }
    // Deshabilitado, TalkBack también dice que no se puede tocar.
    if (confirmacion.value ?? false) {
      return OutlinedButton.icon(
        onPressed: null,
        icon: const Icon(Icons.check),
        label: const Text('Ya confirmaste que sigue'),
      );
    }
    final ocupado = confirmacion.isLoading || _enviando;
    return OutlinedButton.icon(
      onPressed: ocupado ? null : _confirmar,
      icon: ocupado
          ? const SizedBox.square(
              dimension: 18,
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          : const Icon(Icons.visibility_outlined),
      label: const Text('Sigue estando'),
    );
  }

  Future<void> _confirmar() async {
    setState(() => _enviando = true);
    try {
      final cantidad = await ref
          .read(repositorioConfirmacionesProvider)
          .confirmar(_incidenteId);
      if (!mounted) return;
      setState(() => _cantidad = cantidad);
      ref.invalidate(confirmacionProvider(_incidenteId));
    } on ErrorApi catch (error) {
      if (!mounted) return;
      mostrarError(context, error);
      // Ya lo había confirmado (desde otro celular, o en un incidente que se
      // le unió): el botón pasa a decirlo.
      if (error.codigo == 'YA_CONFIRMADO') {
        ref.invalidate(confirmacionProvider(_incidenteId));
      }
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }
}

String _textoContador(int cantidad) => switch (cantidad) {
  0 => 'Nadie confirmó todavía que sigue',
  1 => '1 vecino confirmó que sigue',
  _ => '$cantidad vecinos confirmaron que sigue',
};

class _Dato extends StatelessWidget {
  const _Dato(this.icono, this.nombre, this.valor);

  final IconData icono;
  final String nombre;
  final String valor;

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: Espacio.md),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icono, size: 20, color: tema.colorScheme.onSurfaceVariant),
          const SizedBox(width: Espacio.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  nombre,
                  style: tema.textTheme.bodySmall?.copyWith(
                    color: tema.colorScheme.onSurfaceVariant,
                  ),
                ),
                Text(valor),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Dónde está, sin poder mover el mapa: es para ubicarse, no para navegar.
class MapaProblema extends StatelessWidget {
  const MapaProblema(this.ficha, {super.key});

  final FichaIncidente ficha;

  @override
  Widget build(BuildContext context) {
    final punto = LatLng(ficha.lat, ficha.lon);
    return Semantics(
      container: true,
      label: 'Mapa con la ubicación del incidente',
      child: ClipRRect(
        borderRadius: BorderRadius.circular(radioBorde),
        child: SizedBox(
          height: 180,
          child: FlutterMap(
            options: MapOptions(
              initialCenter: punto,
              initialZoom: 16,
              interactionOptions: const InteractionOptions(
                flags: InteractiveFlag.none,
              ),
            ),
            children: [
              const CapaOsm(),
              MarkerLayer(
                markers: [
                  Marker(
                    point: punto,
                    width: 32,
                    height: 32,
                    child: MarcaEstado(ficha.estado),
                  ),
                ],
              ),
              const AtribucionOsm(),
            ],
          ),
        ),
      ),
    );
  }
}

/// En qué está la atención del problema: los pasos de registrado a resuelto,
/// con los cumplidos marcados y el actual resaltado. Las fechas que se
/// conocen (el primer reporte y la resolución) van con su paso.
class RecorridoProblema extends StatelessWidget {
  const RecorridoProblema(this.ficha, {super.key});

  final FichaIncidente ficha;

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    final actual = EstadoVisible.values.indexOf(ficha.estado);
    final fechas = {
      EstadoVisible.registrado: ficha.primerReporteEn,
      EstadoVisible.resuelto: ficha.resueltoEn,
    };
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Semantics(
          header: true,
          child: Text('Estado del problema', style: tema.textTheme.titleMedium),
        ),
        const SizedBox(height: Espacio.md),
        for (final (i, estado) in EstadoVisible.values.indexed)
          _Paso(
            estado,
            hecho: i <= actual,
            actual: i == actual,
            fecha: i <= actual ? fechas[estado] : null,
            ultimo: i == EstadoVisible.values.length - 1,
          ),
      ],
    );
  }
}

class _Paso extends StatelessWidget {
  const _Paso(
    this.estado, {
    required this.hecho,
    required this.actual,
    required this.fecha,
    required this.ultimo,
  });

  final EstadoVisible estado;
  final bool hecho;
  final bool actual;
  final DateTime? fecha;
  final bool ultimo;

  String get _descripcion {
    final partes = [
      estado.etiqueta,
      hecho ? 'cumplido' : 'pendiente',
      if (actual) 'estado actual',
      if (fecha case final fecha?) fechaLarga(fecha),
    ];
    return partes.join(', ');
  }

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    final color = estado.color(context);
    final secundario = tema.colorScheme.onSurfaceVariant;
    final Border? borde;
    if (actual) {
      borde = Border.all(color: tema.colorScheme.primary, width: 3);
    } else if (!hecho) {
      borde = Border.all(color: tema.colorScheme.outline);
    } else {
      borde = null;
    }
    return Semantics(
      container: true,
      label: _descripcion,
      child: ExcludeSemantics(
        child: IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Column(
                children: [
                  Container(
                    width: 28,
                    height: 28,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: hecho ? color : null,
                      border: borde,
                    ),
                    child: Icon(
                      hecho ? Icons.check : estado.icono,
                      size: 16,
                      color: hecho
                          ? tema.extension<ColoresFijos>()!.sobreEstado
                          : secundario,
                    ),
                  ),
                  if (!ultimo)
                    Expanded(
                      child: Container(
                        width: 2,
                        color: hecho ? color : tema.colorScheme.outline,
                      ),
                    ),
                ],
              ),
              const SizedBox(width: Espacio.md),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.only(top: 4, bottom: Espacio.md),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        estado.etiqueta,
                        style: tema.textTheme.bodyMedium?.copyWith(
                          fontWeight: hecho ? FontWeight.w600 : null,
                          color: hecho ? null : secundario,
                        ),
                      ),
                      if (fecha case final fecha?)
                        Text(
                          fechaLarga(fecha),
                          style: tema.textTheme.bodySmall?.copyWith(
                            color: secundario,
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
