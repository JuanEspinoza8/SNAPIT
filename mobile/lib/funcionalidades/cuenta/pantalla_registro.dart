import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../compartido/errores/mensaje_error.dart';
import '../../compartido/red/error_api.dart';
import '../../compartido/rutas/rutas_app.dart';
import '../../compartido/sesion/repositorio_auth.dart';
import '../../compartido/tema/tema_app.dart';
import 'campo_clave.dart';
import 'validaciones.dart';

class PantallaRegistro extends ConsumerStatefulWidget {
  const PantallaRegistro({super.key});

  @override
  ConsumerState<PantallaRegistro> createState() => _PantallaRegistroState();
}

class _PantallaRegistroState extends ConsumerState<PantallaRegistro> {
  final _formulario = GlobalKey<FormState>();
  final _nombre = TextEditingController();
  final _correo = TextEditingController();
  final _clave = TextEditingController();
  var _enviando = false;
  ErrorApi? _error;

  /// Errores del servidor por campo (`nombre`, `email`, `clave`).
  var _erroresCampo = <String, String>{};

  /// Correo con el que se creó la cuenta; null mientras no se envió.
  String? _registrado;

  static const _campos = {'nombre', 'email', 'clave'};

  @override
  void dispose() {
    _nombre.dispose();
    _correo.dispose();
    _clave.dispose();
    super.dispose();
  }

  Future<void> _registrar() async {
    // Un error del servidor en un campo se borra cuando se lo corrige
    // (`_corrigio`); mientras tanto, `validate` lo sigue dando por inválido.
    if (_enviando || !_formulario.currentState!.validate()) return;
    setState(() {
      _enviando = true;
      _error = null;
    });
    final correo = _correo.text.trim();
    try {
      await ref
          .read(repositorioAuthProvider)
          .registrar(
            nombre: _nombre.text.trim(),
            email: correo,
            clave: _clave.text,
          );
      if (mounted) setState(() => _registrado = correo);
    } catch (e) {
      if (mounted) _mostrarError(ErrorApi.desde(e));
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }

  void _mostrarError(ErrorApi error) {
    final porCampo = {for (final d in error.detalles) d.campo: d.mensaje};
    if (error.codigo == 'EMAIL_EN_USO') porCampo['email'] = error.mensaje;
    final todosEnSuCampo =
        porCampo.isNotEmpty && porCampo.keys.every(_campos.contains);
    setState(() {
      _erroresCampo = porCampo;
      _error = todosEnSuCampo ? null : error;
    });
  }

  void _corrigio(String campo) {
    if (_erroresCampo.containsKey(campo)) {
      setState(() => _erroresCampo = {..._erroresCampo}..remove(campo));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Crear una cuenta')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(Espacio.lg),
          child: switch (_registrado) {
            final correo? => _Enviado(correo: correo),
            null => _formularioRegistro(),
          },
        ),
      ),
    );
  }

  Widget _formularioRegistro() {
    return Form(
      key: _formulario,
      autovalidateMode: AutovalidateMode.onUnfocus,
      child: AutofillGroup(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TextFormField(
              controller: _nombre,
              validator: validarNombre,
              forceErrorText: _erroresCampo['nombre'],
              onChanged: (_) => _corrigio('nombre'),
              textCapitalization: TextCapitalization.words,
              autofillHints: const [AutofillHints.name],
              textInputAction: TextInputAction.next,
              decoration: const InputDecoration(labelText: 'Nombre'),
            ),
            const SizedBox(height: Espacio.lg),
            TextFormField(
              controller: _correo,
              validator: validarCorreo,
              forceErrorText: _erroresCampo['email'],
              onChanged: (_) => _corrigio('email'),
              keyboardType: TextInputType.emailAddress,
              autocorrect: false,
              autofillHints: const [AutofillHints.email],
              textInputAction: TextInputAction.next,
              decoration: const InputDecoration(labelText: 'Correo'),
            ),
            const SizedBox(height: Espacio.lg),
            CampoClave(
              controlador: _clave,
              validador: validarClaveNueva,
              ayuda: 'Al menos 8 caracteres',
              errorServidor: _erroresCampo['clave'],
              esNueva: true,
              alCambiar: (_) => _corrigio('clave'),
              alEnviar: _registrar,
            ),
            if (_error case final error?) ...[
              const SizedBox(height: Espacio.lg),
              MensajeError(error.mensaje),
            ],
            const SizedBox(height: Espacio.xl),
            FilledButton(
              onPressed: _enviando ? null : _registrar,
              child: Text(_enviando ? 'Creando la cuenta…' : 'Crear cuenta'),
            ),
          ],
        ),
      ),
    );
  }
}

class _Enviado extends StatelessWidget {
  const _Enviado({required this.correo});

  final String correo;

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Revisá tu correo', style: tema.textTheme.titleLarge),
        const SizedBox(height: Espacio.md),
        Text(
          'Te enviamos un enlace a $correo. Abrilo para confirmar la cuenta '
          'y después ingresá con tu correo y tu clave.',
        ),
        const SizedBox(height: Espacio.md),
        Text(
          'Si no te llega o el enlace venció, usá «Olvidé mi clave»: al '
          'elegir una clave nueva también se confirma la cuenta.',
          style: tema.textTheme.bodySmall?.copyWith(
            color: tema.colorScheme.onSurfaceVariant,
          ),
        ),
        const SizedBox(height: Espacio.xl),
        FilledButton(
          onPressed: () => context.go(Rutas.ingreso),
          child: const Text('Ir al ingreso'),
        ),
      ],
    );
  }
}
