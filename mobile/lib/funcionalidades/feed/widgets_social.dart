import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../compartido/errores/aviso_error.dart';
import '../../compartido/errores/mensaje_error.dart';
import '../../compartido/formato/fechas.dart';
import '../../compartido/red/error_api.dart';
import '../../compartido/rutas/rutas_app.dart';
import '../../compartido/sesion/sesion.dart';
import '../../compartido/sesion/usuario.dart';
import '../../compartido/tema/tema_app.dart';
import 'estado_feed.dart';
import 'social.dart';

/// El círculo con el número del vecino, que hace de foto de perfil. El de
/// SnapIt es su logo, cuadrado para que entre entero en el círculo.
class AvatarAutor extends StatelessWidget {
  const AvatarAutor(this.autor, {super.key, this.radio = 16});

  final Autor autor;
  final double radio;

  @override
  Widget build(BuildContext context) {
    final esquema = Theme.of(context).colorScheme;
    if (autor.sistema) {
      return ExcludeSemantics(
        child: CircleAvatar(
          radius: radio,
          backgroundImage: const AssetImage('assets/avatar-snapit.png'),
        ),
      );
    }
    return ExcludeSemantics(
      child: CircleAvatar(
        radius: radio,
        backgroundColor: esquema.primary,
        foregroundColor: esquema.onPrimary,
        child: Text('${autor.numero}', style: TextStyle(fontSize: radio * 0.9)),
      ),
    );
  }
}

/// Sin sesión, dar me gusta o comentar lleva al ingreso; al ingresar se
/// vuelve a esta pantalla (`volver`, en rutas_app.dart).
void irAlIngreso(BuildContext context) {
  final aca = GoRouterState.of(context).uri.toString();
  // Con go (no push): así la redirección ve `volver` en la dirección.
  context.go(
    Uri(path: Rutas.ingreso, queryParameters: {'volver': aca}).toString(),
  );
}

/// Quién puede hacer qué: el vecino da me gusta y comenta. El operador y el
/// administrador solo miran: moderan desde la web.
({bool conSesion, bool vecino}) _permisos(WidgetRef ref) {
  final usuario = ref.watch(sesionProvider).value;
  return (conSesion: usuario != null, vecino: usuario?.rol == Rol.vecino);
}

/// Después de dar me gusta o comentar: la publicación, la lista del problema
/// y el feed muestran los contadores nuevos.
void _refrescar(
  WidgetRef ref,
  int reporteId, {
  bool? yaMeGusta,
  int? cantidadMeGusta,
  int? cantidadComentarios,
}) {
  ref.invalidate(reporteProvider(reporteId));
  ref.invalidate(comentariosDeReporteProvider(reporteId));
  ref.invalidate(reportesDeIncidenteProvider);
  ref
      .read(feedProvider.notifier)
      .actualizar(
        reporteId,
        yaMeGusta: yaMeGusta,
        cantidadMeGusta: cantidadMeGusta,
        cantidadComentarios: cantidadComentarios,
      );
}

/// El corazón con el contador. El vecino lo toca para dar o quitar su me
/// gusta; sin sesión lleva al ingreso; el operador y el administrador solo
/// ven el número. Si el servidor lo rechaza, el contador queda como estaba y
/// se avisa por qué.
class BotonMeGusta extends ConsumerStatefulWidget {
  const BotonMeGusta(this.reporte, {super.key});

  final ReportePublico reporte;

  @override
  ConsumerState<BotonMeGusta> createState() => _BotonMeGustaState();
}

class _BotonMeGustaState extends ConsumerState<BotonMeGusta> {
  var _enviando = false;

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    final permisos = _permisos(ref);
    final dado = widget.reporte.yaMeGusta;
    final cantidad = widget.reporte.cantidadMeGusta;
    final texto = cantidad == 1 ? '1 me gusta' : '$cantidad me gusta';
    final contador = Text('$cantidad', style: tema.textTheme.labelLarge);

    if (permisos.conSesion && !permisos.vecino) {
      return Semantics(
        container: true,
        label: texto,
        child: ExcludeSemantics(
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.favorite_border,
                size: 22,
                color: tema.colorScheme.onSurfaceVariant,
              ),
              const SizedBox(width: Espacio.xs),
              contador,
            ],
          ),
        ),
      );
    }
    return Semantics(
      container: true,
      button: true,
      toggled: dado,
      label: dado ? 'Quitar me gusta, $texto' : 'Me gusta, $texto',
      child: ExcludeSemantics(
        child: TextButton.icon(
          onPressed: _enviando
              ? null
              : () => permisos.conSesion ? _cambiar() : irAlIngreso(context),
          icon: Icon(
            dado ? Icons.favorite : Icons.favorite_border,
            color: dado
                ? tema.colorScheme.error
                : tema.colorScheme.onSurfaceVariant,
          ),
          label: contador,
        ),
      ),
    );
  }

  Future<void> _cambiar() async {
    final reporte = widget.reporte;
    setState(() => _enviando = true);
    try {
      final cantidad = await ref
          .read(repositorioSocialProvider)
          .meGusta(reporte.id, dar: !reporte.yaMeGusta);
      _refrescar(
        ref,
        reporte.id,
        yaMeGusta: !reporte.yaMeGusta,
        cantidadMeGusta: cantidad,
      );
    } catch (error) {
      if (mounted) mostrarError(context, error);
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }
}

/// Los comentarios de una publicación, del más viejo al más nuevo (el de
/// SnapIt queda primero), con la caja para comentar. Cada vecino edita o
/// elimina los suyos.
class ComentariosDelReporte extends ConsumerWidget {
  const ComentariosDelReporte(this.reporteId, {super.key});

  final int reporteId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tema = Theme.of(context);
    final comentarios = ref.watch(comentariosDeReporteProvider(reporteId));
    final permisos = _permisos(ref);
    final secundario = tema.textTheme.bodySmall?.copyWith(
      color: tema.colorScheme.onSurfaceVariant,
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Semantics(
          header: true,
          child: Text(switch (comentarios) {
            AsyncData(:final value) => 'Comentarios (${value.length})',
            _ => 'Comentarios',
          }, style: tema.textTheme.titleMedium),
        ),
        const SizedBox(height: Espacio.md),
        switch (comentarios) {
          AsyncData(:final value) when value.isEmpty => Text(
            'Todavía no hay comentarios.',
            style: secundario,
          ),
          AsyncData(:final value) => Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (final c in value) _FilaComentario(c, reporteId: reporteId),
            ],
          ),
          AsyncError(:final error) when !comentarios.isLoading => Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              MensajeError(ErrorApi.desde(error).mensaje),
              const SizedBox(height: Espacio.sm),
              OutlinedButton(
                onPressed: () =>
                    ref.invalidate(comentariosDeReporteProvider(reporteId)),
                child: const Text('Reintentar'),
              ),
            ],
          ),
          _ => const Padding(
            padding: EdgeInsets.all(Espacio.lg),
            child: Center(
              child: CircularProgressIndicator(
                semanticsLabel: 'Cargando los comentarios',
              ),
            ),
          ),
        },
        const SizedBox(height: Espacio.md),
        if (permisos.vecino)
          _CajaComentario(reporteId)
        else if (!permisos.conSesion)
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton(
              onPressed: () => irAlIngreso(context),
              child: const Text('Ingresá para comentar'),
            ),
          ),
      ],
    );
  }
}

/// El campo de un comentario, con el contador de caracteres. Pasado el máximo
/// se pone en rojo y no se puede enviar (no corta lo escrito).
class _CampoComentario extends StatelessWidget {
  const _CampoComentario({
    required this.controlador,
    required this.etiqueta,
    this.alCambiar,
    this.autofocus = false,
  });

  final TextEditingController controlador;
  final String etiqueta;
  final ValueChanged<String>? alCambiar;
  final bool autofocus;

  @override
  Widget build(BuildContext context) => TextField(
    controller: controlador,
    autofocus: autofocus,
    onChanged: alCambiar,
    minLines: 1,
    maxLines: 5,
    maxLength: maximoComentario,
    maxLengthEnforcement: MaxLengthEnforcement.none,
    textCapitalization: TextCapitalization.sentences,
    decoration: InputDecoration(labelText: etiqueta),
  );
}

bool _sePuedeEnviar(String texto) {
  final limpio = texto.trim();
  return limpio.isNotEmpty && limpio.length <= maximoComentario;
}

class _CajaComentario extends ConsumerStatefulWidget {
  const _CajaComentario(this.reporteId);

  final int reporteId;

  @override
  ConsumerState<_CajaComentario> createState() => _CajaComentarioState();
}

class _CajaComentarioState extends ConsumerState<_CajaComentario> {
  final _texto = TextEditingController();
  var _enviando = false;

  @override
  void dispose() {
    _texto.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final listo = _sePuedeEnviar(_texto.text) && !_enviando;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _CampoComentario(
          controlador: _texto,
          etiqueta: 'Escribí un comentario',
          alCambiar: (_) => setState(() {}),
        ),
        Align(
          alignment: Alignment.centerRight,
          child: FilledButton(
            onPressed: listo ? _enviar : null,
            child: Text(_enviando ? 'Publicando…' : 'Comentar'),
          ),
        ),
      ],
    );
  }

  Future<void> _enviar() async {
    FocusManager.instance.primaryFocus?.unfocus();
    setState(() => _enviando = true);
    try {
      await ref
          .read(repositorioSocialProvider)
          .comentar(widget.reporteId, _texto.text.trim());
      _texto.clear();
      final reporte = ref.read(reporteProvider(widget.reporteId)).value;
      _refrescar(
        ref,
        widget.reporteId,
        cantidadComentarios: reporte == null
            ? null
            : reporte.cantidadComentarios + 1,
      );
    } catch (error) {
      if (mounted) mostrarError(context, error);
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }
}

class _FilaComentario extends ConsumerWidget {
  const _FilaComentario(this.comentario, {required this.reporteId});

  final Comentario comentario;
  final int reporteId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tema = Theme.of(context);
    final secundario = tema.textTheme.labelSmall?.copyWith(
      color: tema.colorScheme.onSurfaceVariant,
    );
    return Padding(
      padding: const EdgeInsets.only(bottom: Espacio.md),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AvatarAutor(comentario.autor),
          const SizedBox(width: Espacio.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Wrap(
                  spacing: Espacio.sm,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    _NombreAutor(comentario.autor),
                    Text(
                      comentario.editado
                          ? '${haceCuanto(comentario.creadoEn)} · editado'
                          : haceCuanto(comentario.creadoEn),
                      style: secundario,
                    ),
                  ],
                ),
                const SizedBox(height: 2),
                Text(comentario.texto),
              ],
            ),
          ),
          if (comentario.esMio)
            PopupMenuButton<_Accion>(
              tooltip: 'Opciones de tu comentario',
              onSelected: (accion) => switch (accion) {
                _Accion.editar => _editar(context, ref),
                _Accion.eliminar => _eliminar(context, ref),
              },
              itemBuilder: (_) => const [
                PopupMenuItem(value: _Accion.editar, child: Text('Editar')),
                PopupMenuItem(value: _Accion.eliminar, child: Text('Eliminar')),
              ],
            ),
        ],
      ),
    );
  }

  Future<void> _editar(BuildContext context, WidgetRef ref) async {
    final texto = await showDialog<String>(
      context: context,
      builder: (_) => _DialogoEditar(comentario.texto),
    );
    if (texto == null || !context.mounted) return;
    try {
      await ref
          .read(repositorioSocialProvider)
          .editarComentario(comentario.id, texto);
      _refrescar(ref, reporteId);
    } catch (error) {
      if (context.mounted) mostrarError(context, error);
    }
  }

  Future<void> _eliminar(BuildContext context, WidgetRef ref) async {
    final confirmado = await showDialog<bool>(
      context: context,
      builder: (contexto) => AlertDialog(
        title: const Text('¿Eliminar tu comentario?'),
        content: const Text('No se puede deshacer.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(contexto, false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(contexto, true),
            child: const Text('Eliminar'),
          ),
        ],
      ),
    );
    if (confirmado != true || !context.mounted) return;
    try {
      await ref
          .read(repositorioSocialProvider)
          .eliminarComentario(comentario.id);
      final reporte = ref.read(reporteProvider(reporteId)).value;
      _refrescar(
        ref,
        reporteId,
        cantidadComentarios: reporte == null
            ? null
            : reporte.cantidadComentarios - 1,
      );
    } catch (error) {
      if (context.mounted) mostrarError(context, error);
    }
  }
}

enum _Accion { editar, eliminar }

/// Editar un comentario propio: devuelve el texto nuevo, o null si se cancela.
class _DialogoEditar extends StatefulWidget {
  const _DialogoEditar(this.inicial);

  final String inicial;

  @override
  State<_DialogoEditar> createState() => _DialogoEditarState();
}

class _DialogoEditarState extends State<_DialogoEditar> {
  late final _texto = TextEditingController(text: widget.inicial);

  @override
  void dispose() {
    _texto.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: const Text('Editar el comentario'),
    content: _CampoComentario(
      controlador: _texto,
      etiqueta: 'Comentario',
      autofocus: true,
      alCambiar: (_) => setState(() {}),
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.pop(context),
        child: const Text('Cancelar'),
      ),
      FilledButton(
        onPressed: _sePuedeEnviar(_texto.text)
            ? () => Navigator.pop(context, _texto.text.trim())
            : null,
        child: const Text('Guardar'),
      ),
    ],
  );
}

/// El nombre de quien comentó. SnapIt lleva una marca de cuenta oficial, para
/// que no se confunda con un vecino.
class _NombreAutor extends StatelessWidget {
  const _NombreAutor(this.autor);

  final Autor autor;

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    final nombre = Text(autor.nombre, style: tema.textTheme.labelMedium);
    if (!autor.sistema) return nombre;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        nombre,
        const SizedBox(width: Espacio.xs),
        Icon(
          Icons.verified,
          size: 16,
          color: tema.colorScheme.primary,
          semanticLabel: 'cuenta oficial',
        ),
      ],
    );
  }
}
