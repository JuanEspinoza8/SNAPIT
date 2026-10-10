import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart';

import '../../compartido/errores/mensaje_error.dart';
import '../../compartido/mapa/capa_osm.dart';
import '../../compartido/red/error_api.dart';
import '../../compartido/rutas/rutas_app.dart';
import '../../compartido/tema/tema_app.dart';
import '../mapa/repositorio_mapa.dart';
import '../mapa/ubicacion.dart';
import 'borrador_reporte.dart';
import 'reporte_en_curso.dart';
import 'selector_foto.dart';

/// Cargar un reporte (F02): foto, categoría, gravedad, descripción y el punto
/// del GPS, que se puede corregir en el mapa.
class PantallaReportar extends ConsumerStatefulWidget {
  const PantallaReportar({super.key, required this.alVerEnMapa});

  /// Después de enviar, lleva al mapa centrado en el punto del reporte.
  final ValueChanged<LatLng> alVerEnMapa;

  @override
  ConsumerState<PantallaReportar> createState() => _PantallaReportarState();
}

class _PantallaReportarState extends ConsumerState<PantallaReportar> {
  late final _descripcion = TextEditingController(
    text: ref.read(reporteEnCursoProvider).descripcion,
  );
  late final AppLifecycleListener _ciclo;

  var _buscandoUbicacion = false;
  ProblemaUbicacion? _problemaUbicacion;
  var _eligiendoFoto = false;
  String? _errorFoto;

  /// Se marcan los campos que faltan recién después de tocar «Enviar».
  var _mostrarFaltantes = false;
  var _enviando = false;
  ErrorApi? _errorEnvio;

  /// Errores que devolvió el servidor, por campo. Se borra el de un campo
  /// cuando el vecino lo cambia.
  var _erroresServidor = <CampoReporte, String>{};

  /// El punto del reporte recién enviado. Mientras no es null se ve la
  /// confirmación en lugar del formulario.
  LatLng? _enviadoEn;

  @override
  void initState() {
    super.initState();
    // Al volver de los ajustes del teléfono se reintenta solo. Con el permiso
    // negado sin «No volver a preguntar» no: el propio cuadro del permiso
    // pausa la app, y se volvería a preguntar en cada vuelta.
    _ciclo = AppLifecycleListener(
      onResume: () {
        if (_problemaUbicacion
            case ProblemaUbicacion.apagada ||
                ProblemaUbicacion.sinPermisoParaSiempre) {
          _buscarUbicacion();
        }
      },
    );
    if (ref.read(reporteEnCursoProvider).punto == null) _buscarUbicacion();
  }

  @override
  void dispose() {
    _ciclo.dispose();
    _descripcion.dispose();
    super.dispose();
  }

  ReporteEnCurso get _reporte => ref.read(reporteEnCursoProvider.notifier);

  /// Antes de ir a otra pantalla: si la descripción tiene el foco, al volver
  /// Flutter se lo devuelve y el teclado tapa el formulario.
  void _cerrarTeclado() => FocusManager.instance.primaryFocus?.unfocus();

  Future<void> _buscarUbicacion() async {
    if (_buscandoUbicacion) return;
    setState(() {
      _buscandoUbicacion = true;
      _problemaUbicacion = null;
    });
    try {
      final punto = await ref.read(ubicacionProvider).paraReportar();
      if (!mounted) return;
      _reporte.ponerPuntoDelGps(punto);
      _erroresServidor.remove(CampoReporte.ubicacion);
    } on ErrorUbicacion catch (e) {
      if (mounted) setState(() => _problemaUbicacion = e.problema);
    } finally {
      if (mounted) setState(() => _buscandoUbicacion = false);
    }
  }

  Future<void> _elegirFoto(FuenteFoto fuente) async {
    if (_eligiendoFoto) return;
    _cerrarTeclado();
    setState(() {
      _eligiendoFoto = true;
      _errorFoto = null;
    });
    try {
      final ruta = await ref.read(selectorFotoProvider).elegir(fuente);
      if (ruta == null || !mounted) return;
      _reporte.ponerFoto(ruta, fuente);
      _erroresServidor.remove(CampoReporte.foto);
    } on ErrorFoto catch (e) {
      if (mounted) setState(() => _errorFoto = e.mensaje);
    } finally {
      if (mounted) setState(() => _eligiendoFoto = false);
    }
  }

  Future<void> _moverPunto(LatLng actual) async {
    _cerrarTeclado();
    final elegido = await context.push<LatLng>(
      Rutas.elegirPunto,
      extra: actual,
    );
    if (elegido == null || elegido == actual || !mounted) return;
    _reporte.moverPunto(elegido);
    setState(() => _erroresServidor.remove(CampoReporte.ubicacion));
  }

  Future<void> _enviar() async {
    if (_enviando) return;
    _cerrarTeclado();
    final borrador = ref.read(reporteEnCursoProvider);
    if (borrador.faltantes.isNotEmpty) {
      setState(() => _mostrarFaltantes = true);
      return;
    }
    setState(() {
      _enviando = true;
      _errorEnvio = null;
      _erroresServidor = {};
    });
    try {
      await _reporte.enviar();
      if (!mounted) return;
      _descripcion.clear();
      setState(() {
        _enviadoEn = borrador.punto;
        _mostrarFaltantes = false;
      });
    } catch (e) {
      final error = ErrorApi.desde(e);
      if (!mounted) return;
      setState(() {
        _errorEnvio = error;
        _erroresServidor = {
          // Los detalles que la pantalla no muestra quedan afuera (null).
          for (final detalle in error.detalles)
            ?CampoReporte.desdeApi(detalle.campo): detalle.mensaje,
        };
      });
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }

  void _reportarOtro() {
    setState(() => _enviadoEn = null);
    _buscarUbicacion();
  }

  /// El aviso general del envío, con los detalles que no van debajo de
  /// ningún campo de la pantalla.
  String _mensajeEnvio(ErrorApi error) {
    final sueltos = [
      for (final detalle in error.detalles)
        if (CampoReporte.desdeApi(detalle.campo) == null) detalle.mensaje,
    ];
    return [error.mensaje, ...sueltos].join('. ');
  }

  @override
  Widget build(BuildContext context) {
    if (_enviadoEn case final punto?) {
      return _Enviado(
        alVerEnMapa: () => widget.alVerEnMapa(punto),
        alReportarOtro: _reportarOtro,
      );
    }

    final borrador = ref.watch(reporteEnCursoProvider);
    final faltantes = _mostrarFaltantes
        ? borrador.faltantes
        : const <CampoReporte, String>{};
    String? errorDe(CampoReporte campo) =>
        _erroresServidor[campo] ?? faltantes[campo];

    return IgnorePointer(
      // Mientras sale el reporte no se puede cambiar nada: lo que se envía es
      // lo que se ve.
      ignoring: _enviando,
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(Espacio.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const _Titulo('Foto'),
            _SeccionFoto(
              foto: borrador.foto,
              eligiendo: _eligiendoFoto,
              alElegir: _elegirFoto,
            ),
            _ErrorCampo(_errorFoto ?? errorDe(CampoReporte.foto)),
            const SizedBox(height: Espacio.xl),
            _CampoCategoria(
              elegida: borrador.categoriaId,
              error: errorDe(CampoReporte.categoria),
              alElegir: (id) {
                _reporte.ponerCategoria(id);
                setState(() => _erroresServidor.remove(CampoReporte.categoria));
              },
            ),
            const SizedBox(height: Espacio.xl),
            const _Titulo('Gravedad'),
            SegmentedButton<Severidad>(
              // Con la tilde de elegido, «Moderada» no entra en un celular
              // angosto: menos margen y, si igual no alcanza, la letra se
              // achica en vez de partir la palabra.
              style: SegmentedButton.styleFrom(
                padding: const EdgeInsets.symmetric(horizontal: Espacio.sm),
              ),
              segments: [
                for (final severidad in Severidad.values)
                  ButtonSegment(
                    value: severidad,
                    label: FittedBox(
                      fit: BoxFit.scaleDown,
                      child: Text(severidad.etiqueta, maxLines: 1),
                    ),
                  ),
              ],
              selected: {?borrador.severidad},
              emptySelectionAllowed: true,
              onSelectionChanged: (elegidas) {
                if (elegidas.isEmpty) return;
                _reporte.ponerSeveridad(elegidas.first);
                setState(() => _erroresServidor.remove(CampoReporte.severidad));
              },
            ),
            _ErrorCampo(errorDe(CampoReporte.severidad)),
            const SizedBox(height: Espacio.xl),
            TextField(
              controller: _descripcion,
              maxLength: 1000,
              minLines: 2,
              maxLines: 5,
              textCapitalization: TextCapitalization.sentences,
              decoration: InputDecoration(
                labelText: 'Descripción (opcional)',
                hintText: 'Por ejemplo: pozo grande frente a la escuela',
                errorText: errorDe(CampoReporte.descripcion),
              ),
              onChanged: (texto) {
                _reporte.ponerDescripcion(texto);
                if (_erroresServidor.containsKey(CampoReporte.descripcion)) {
                  setState(
                    () => _erroresServidor.remove(CampoReporte.descripcion),
                  );
                }
              },
            ),
            const SizedBox(height: Espacio.lg),
            const _Titulo('Ubicación'),
            _SeccionUbicacion(
              punto: borrador.punto,
              movido: borrador.puntoMovido,
              buscando: _buscandoUbicacion,
              problema: _problemaUbicacion,
              alReintentar: _buscarUbicacion,
              alAbrirAjustes: (problema) =>
                  ref.read(ubicacionProvider).abrirAjustes(problema),
              alMover: _moverPunto,
            ),
            _ErrorCampo(
              _problemaUbicacion == null
                  ? errorDe(CampoReporte.ubicacion)
                  : null,
            ),
            const SizedBox(height: Espacio.xl),
            if (faltantes.isNotEmpty) ...[
              const MensajeError('Faltan datos: revisá los campos marcados.'),
              const SizedBox(height: Espacio.lg),
            ],
            if (_errorEnvio case final error?) ...[
              MensajeError(_mensajeEnvio(error)),
              const SizedBox(height: Espacio.lg),
            ],
            FilledButton.icon(
              onPressed: _enviando ? null : _enviar,
              icon: _enviando
                  ? const SizedBox.square(
                      dimension: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.send_outlined),
              label: Text(_enviando ? 'Enviando…' : 'Enviar reporte'),
            ),
          ],
        ),
      ),
    );
  }
}

class _Titulo extends StatelessWidget {
  const _Titulo(this.texto);

  final String texto;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: Espacio.sm),
      child: Semantics(
        header: true,
        child: Text(texto, style: Theme.of(context).textTheme.titleMedium),
      ),
    );
  }
}

/// El error debajo de una sección. Nada si es null.
class _ErrorCampo extends StatelessWidget {
  const _ErrorCampo(this.mensaje);

  final String? mensaje;

  @override
  Widget build(BuildContext context) {
    final mensaje = this.mensaje;
    if (mensaje == null) return const SizedBox.shrink();
    final tema = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(top: Espacio.sm),
      child: Semantics(
        liveRegion: true,
        child: Text(
          mensaje,
          style: tema.textTheme.bodySmall?.copyWith(
            color: tema.colorScheme.error,
          ),
        ),
      ),
    );
  }
}

class _SeccionFoto extends StatelessWidget {
  const _SeccionFoto({
    required this.foto,
    required this.eligiendo,
    required this.alElegir,
  });

  final FotoReporte? foto;
  final bool eligiendo;
  final ValueChanged<FuenteFoto> alElegir;

  @override
  Widget build(BuildContext context) {
    final foto = this.foto;
    final alSacar = eligiendo ? null : () => alElegir(FuenteFoto.camara);
    final alBuscar = eligiendo ? null : () => alElegir(FuenteFoto.galeria);

    if (foto == null) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          FilledButton.icon(
            onPressed: alSacar,
            icon: const Icon(Icons.photo_camera_outlined),
            label: const Text('Sacar foto'),
          ),
          const SizedBox(height: Espacio.sm),
          OutlinedButton.icon(
            onPressed: alBuscar,
            icon: const Icon(Icons.photo_library_outlined),
            label: const Text('Elegir de la galería'),
          ),
        ],
      );
    }

    final tema = Theme.of(context);
    // Se decodifica al ancho de la pantalla, no a los megapíxeles de la foto.
    final anchoEnPixeles =
        (MediaQuery.sizeOf(context).width *
                MediaQuery.devicePixelRatioOf(context))
            .round();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(radioBorde),
          child: AspectRatio(
            aspectRatio: 4 / 3,
            child: Image.file(
              File(foto.ruta),
              fit: BoxFit.cover,
              cacheWidth: anchoEnPixeles,
              semanticLabel: 'Foto del problema',
              errorBuilder: (_, _, _) => ColoredBox(
                color: tema.colorScheme.surfaceContainerLow,
                child: const Center(child: Text('No se pudo mostrar la foto')),
              ),
            ),
          ),
        ),
        const SizedBox(height: Espacio.sm),
        Row(
          children: [
            Expanded(
              child: TextButton.icon(
                onPressed: alSacar,
                icon: const Icon(Icons.photo_camera_outlined),
                label: const Text('Sacar otra'),
              ),
            ),
            Expanded(
              child: TextButton.icon(
                onPressed: alBuscar,
                icon: const Icon(Icons.photo_library_outlined),
                label: const Text('Galería'),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _CampoCategoria extends ConsumerWidget {
  const _CampoCategoria({
    required this.elegida,
    required this.error,
    required this.alElegir,
  });

  final int? elegida;
  final String? error;
  final ValueChanged<int> alElegir;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final categorias = ref.watch(categoriasProvider);
    const etiqueta = 'Categoría';

    // Al reintentar se ve «Cargando…» y no el error anterior.
    if (categorias.hasError && !categorias.isLoading) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const _Titulo(etiqueta),
          MensajeError(ErrorApi.desde(categorias.error!).mensaje),
          const SizedBox(height: Espacio.sm),
          OutlinedButton(
            onPressed: () => ref.invalidate(categoriasProvider),
            child: const Text('Reintentar'),
          ),
        ],
      );
    }

    final lista = categorias.value;
    if (lista == null || categorias.isLoading) {
      return const InputDecorator(
        decoration: InputDecoration(labelText: etiqueta),
        child: Text('Cargando categorías…'),
      );
    }

    // Si la categoría elegida se desactivó mientras tanto, se vuelve a elegir.
    final valor = lista.any((c) => c.id == elegida) ? elegida : null;
    return DropdownButtonFormField<int>(
      // El campo toma el valor solo al crearse: con otra clave se vuelve a
      // armar cuando el borrador cambia desde afuera (por ejemplo, vacío).
      key: ValueKey(valor),
      initialValue: valor,
      isExpanded: true,
      decoration: InputDecoration(labelText: etiqueta, errorText: error),
      hint: const Text('Elegí una'),
      items: [
        for (final categoria in lista)
          DropdownMenuItem(value: categoria.id, child: Text(categoria.nombre)),
      ],
      onChanged: (id) {
        if (id != null) alElegir(id);
      },
    );
  }
}

class _SeccionUbicacion extends StatelessWidget {
  const _SeccionUbicacion({
    required this.punto,
    required this.movido,
    required this.buscando,
    required this.problema,
    required this.alReintentar,
    required this.alAbrirAjustes,
    required this.alMover,
  });

  final LatLng? punto;
  final bool movido;
  final bool buscando;
  final ProblemaUbicacion? problema;
  final VoidCallback alReintentar;
  final ValueChanged<ProblemaUbicacion> alAbrirAjustes;
  final ValueChanged<LatLng> alMover;

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    final textoSecundario = tema.textTheme.bodySmall?.copyWith(
      color: tema.colorScheme.onSurfaceVariant,
    );

    if (buscando) {
      return Semantics(
        liveRegion: true,
        child: Row(
          children: [
            const SizedBox.square(
              dimension: 20,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
            const SizedBox(width: Espacio.md),
            Expanded(
              child: Text('Buscando tu ubicación…', style: textoSecundario),
            ),
          ],
        ),
      );
    }

    if (problema case final problema?) {
      return _AvisoUbicacion(
        problema: problema,
        alReintentar: alReintentar,
        alAbrirAjustes: () => alAbrirAjustes(problema),
      );
    }

    final punto = this.punto;
    if (punto == null) {
      return OutlinedButton(
        onPressed: alReintentar,
        child: const Text('Buscar mi ubicación'),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(radioBorde),
          child: SizedBox(
            height: 160,
            child: Semantics(
              label: 'Mapa con el punto del reporte',
              // Solo para ver: el punto se mueve en la pantalla grande.
              child: IgnorePointer(
                child: FlutterMap(
                  key: ValueKey(punto),
                  options: MapOptions(
                    initialCenter: punto,
                    initialZoom: 17,
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
                          width: Espacio.xxxl,
                          height: Espacio.xxxl,
                          // La punta del pin sobre el punto.
                          alignment: Alignment.topCenter,
                          child: Icon(
                            Icons.location_on,
                            size: Espacio.xxxl,
                            color: tema.colorScheme.primary,
                          ),
                        ),
                      ],
                    ),
                    const AtribucionOsm(),
                  ],
                ),
              ),
            ),
          ),
        ),
        const SizedBox(height: Espacio.sm),
        Text(
          movido
              ? 'Elegiste el punto en el mapa.'
              : 'Tomada del GPS. Si no coincide con el problema, mové el punto.',
          style: textoSecundario,
        ),
        const SizedBox(height: Espacio.sm),
        OutlinedButton.icon(
          onPressed: () => alMover(punto),
          icon: const Icon(Icons.edit_location_alt_outlined),
          label: const Text('Mover el punto'),
        ),
      ],
    );
  }
}

/// Por qué no hay ubicación y qué hacer, con el botón que lo resuelve.
class _AvisoUbicacion extends StatelessWidget {
  const _AvisoUbicacion({
    required this.problema,
    required this.alReintentar,
    required this.alAbrirAjustes,
  });

  final ProblemaUbicacion problema;
  final VoidCallback alReintentar;
  final VoidCallback alAbrirAjustes;

  @override
  Widget build(BuildContext context) {
    final (mensaje, ajustes, reintentar) = switch (problema) {
      ProblemaUbicacion.apagada => (
        'La ubicación del teléfono está apagada. Activala para que el reporte '
            'lleve el lugar del problema.',
        'Activar la ubicación',
        'Reintentar',
      ),
      ProblemaUbicacion.sinPermiso => (
        'Para reportar hace falta saber dónde está el problema. Tocá '
            '«Permitir ubicación» y aceptá el permiso.',
        null,
        'Permitir ubicación',
      ),
      ProblemaUbicacion.sinPermisoParaSiempre => (
        'SnapIt no tiene permiso para usar tu ubicación. Habilitalo en los '
            'ajustes de la app, en Permisos › Ubicación, y volvé.',
        'Abrir los ajustes',
        'Reintentar',
      ),
      ProblemaUbicacion.sinSenal => (
        'No se pudo obtener tu ubicación. Si estás bajo techo, salí al aire '
            'libre y probá de nuevo.',
        null,
        'Reintentar',
      ),
    };

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        MensajeError(mensaje),
        const SizedBox(height: Espacio.sm),
        if (ajustes != null) ...[
          FilledButton(onPressed: alAbrirAjustes, child: Text(ajustes)),
          const SizedBox(height: Espacio.sm),
        ],
        OutlinedButton(onPressed: alReintentar, child: Text(reintentar)),
      ],
    );
  }
}

class _Enviado extends StatelessWidget {
  const _Enviado({required this.alVerEnMapa, required this.alReportarOtro});

  final VoidCallback alVerEnMapa;
  final VoidCallback alReportarOtro;

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(Espacio.xl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Icon(
              Icons.check_circle_outline,
              size: Espacio.xxxl,
              color: tema.colorScheme.primary,
            ),
            const SizedBox(height: Espacio.lg),
            Semantics(
              liveRegion: true,
              child: Text(
                'Reporte enviado',
                textAlign: TextAlign.center,
                style: tema.textTheme.titleLarge,
              ),
            ),
            const SizedBox(height: Espacio.sm),
            const Text(
              'Ya está en el mapa como «En revisión», hasta que se verifique.',
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: Espacio.xl),
            FilledButton(
              onPressed: alVerEnMapa,
              child: const Text('Ver en el mapa'),
            ),
            const SizedBox(height: Espacio.sm),
            OutlinedButton(
              onPressed: alReportarOtro,
              child: const Text('Reportar otro problema'),
            ),
          ],
        ),
      ),
    );
  }
}
