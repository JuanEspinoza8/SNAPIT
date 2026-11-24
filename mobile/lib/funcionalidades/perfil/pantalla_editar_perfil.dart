import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../compartido/red/error_api.dart';
import '../../compartido/sesion/repositorio_auth.dart';
import '../../compartido/sesion/sesion.dart';
import '../../compartido/tema/tema_app.dart';
import '../cuenta/campo_clave.dart';
import '../cuenta/validaciones.dart';

/// «Editar perfil»: el nombre visible y la contraseña, cada uno con su
/// botón. El correo no se cambia: es con el que se ingresa.
class PantallaEditarPerfil extends ConsumerWidget {
  const PantallaEditarPerfil({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final usuario = ref.watch(sesionProvider).value;
    if (usuario == null) return const SizedBox.shrink();
    final tema = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Editar perfil')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(Espacio.lg),
          children: [
            _FormularioNombre(nombreActual: usuario.nombre),
            const Divider(height: Espacio.xxl * 2),
            const _FormularioClave(),
            const SizedBox(height: Espacio.xl),
            Text(
              'El correo (${usuario.email}) no se puede cambiar: es con el '
              'que ingresás.',
              style: tema.textTheme.bodySmall?.copyWith(
                color: tema.colorScheme.onSurfaceVariant,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _FormularioNombre extends ConsumerStatefulWidget {
  const _FormularioNombre({required this.nombreActual});

  final String nombreActual;

  @override
  ConsumerState<_FormularioNombre> createState() => _EstadoNombre();
}

class _EstadoNombre extends ConsumerState<_FormularioNombre> {
  final _formulario = GlobalKey<FormState>();
  late final _nombre = TextEditingController(text: widget.nombreActual);
  bool _guardando = false;
  String? _errorServidor;

  @override
  void dispose() {
    _nombre.dispose();
    super.dispose();
  }

  Future<void> _guardar() async {
    if (!_formulario.currentState!.validate()) return;
    setState(() {
      _guardando = true;
      _errorServidor = null;
    });
    try {
      final usuario = await ref
          .read(repositorioAuthProvider)
          .cambiarNombre(_nombre.text.trim());
      ref.read(sesionProvider.notifier).actualizarUsuario(usuario);
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Listo, se guardó.')));
    } on ErrorApi catch (error) {
      setState(() => _errorServidor = _detalle(error, 'nombre'));
    } finally {
      if (mounted) setState(() => _guardando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Form(
      key: _formulario,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Nombre', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: Espacio.md),
          TextFormField(
            controller: _nombre,
            maxLength: 120,
            textCapitalization: TextCapitalization.words,
            autofillHints: const [AutofillHints.name],
            decoration: InputDecoration(
              labelText: 'Nombre visible',
              errorText: _errorServidor,
            ),
            validator: validarNombre,
            onChanged: (_) {
              if (_errorServidor != null) setState(() => _errorServidor = null);
            },
          ),
          const SizedBox(height: Espacio.sm),
          FilledButton(
            onPressed: _guardando ? null : _guardar,
            child: Text(_guardando ? 'Guardando…' : 'Guardar nombre'),
          ),
        ],
      ),
    );
  }
}

class _FormularioClave extends ConsumerStatefulWidget {
  const _FormularioClave();

  @override
  ConsumerState<_FormularioClave> createState() => _EstadoClave();
}

class _EstadoClave extends ConsumerState<_FormularioClave> {
  final _formulario = GlobalKey<FormState>();
  final _actual = TextEditingController();
  final _nueva = TextEditingController();
  final _repetida = TextEditingController();
  bool _cambiando = false;
  Map<String, String> _erroresServidor = const {};
  String? _errorGeneral;

  @override
  void dispose() {
    _actual.dispose();
    _nueva.dispose();
    _repetida.dispose();
    super.dispose();
  }

  Future<void> _cambiar() async {
    setState(() {
      _erroresServidor = const {};
      _errorGeneral = null;
    });
    if (!_formulario.currentState!.validate()) return;
    setState(() => _cambiando = true);
    try {
      await ref
          .read(sesionProvider.notifier)
          .cambiarClave(claveActual: _actual.text, claveNueva: _nueva.text);
      _actual.clear();
      _nueva.clear();
      _repetida.clear();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Listo. Se cerró la sesión en los otros dispositivos.'),
        ),
      );
    } on ErrorApi catch (error) {
      final porCampo = {
        for (final detalle in error.detalles) detalle.campo: detalle.mensaje,
      };
      setState(() {
        _erroresServidor = porCampo;
        if (porCampo.isEmpty) _errorGeneral = error.mensaje;
      });
    } finally {
      if (mounted) setState(() => _cambiando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Form(
      key: _formulario,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Contraseña', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: Espacio.md),
          CampoClave(
            controlador: _actual,
            etiqueta: 'Contraseña actual',
            validador: validarClaveIngresada,
            errorServidor: _erroresServidor['claveActual'],
          ),
          const SizedBox(height: Espacio.md),
          CampoClave(
            controlador: _nueva,
            etiqueta: 'Contraseña nueva',
            validador: validarClaveNueva,
            errorServidor: _erroresServidor['claveNueva'],
            esNueva: true,
          ),
          const SizedBox(height: Espacio.md),
          CampoClave(
            controlador: _repetida,
            etiqueta: 'Repetí la contraseña nueva',
            validador: (valor) =>
                valor != _nueva.text ? 'No coincide con la nueva' : null,
            esNueva: true,
            alEnviar: _cambiar,
          ),
          if (_errorGeneral case final mensaje?) ...[
            const SizedBox(height: Espacio.sm),
            Text(
              mensaje,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          ],
          const SizedBox(height: Espacio.md),
          FilledButton(
            onPressed: _cambiando ? null : _cambiar,
            child: Text(_cambiando ? 'Cambiando…' : 'Cambiar contraseña'),
          ),
        ],
      ),
    );
  }
}

/// El mensaje del servidor para un campo, o el general si no viene por campo.
String _detalle(ErrorApi error, String campo) {
  for (final detalle in error.detalles) {
    if (detalle.campo == campo) return detalle.mensaje;
  }
  return error.mensaje;
}
