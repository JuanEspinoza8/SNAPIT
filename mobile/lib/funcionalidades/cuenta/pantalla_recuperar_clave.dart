import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../compartido/errores/mensaje_error.dart';
import '../../compartido/red/error_api.dart';
import '../../compartido/rutas/rutas_app.dart';
import '../../compartido/sesion/repositorio_auth.dart';
import '../../compartido/tema/tema_app.dart';
import 'validaciones.dart';

/// Pide el enlace para elegir una clave nueva. La clave nueva se elige en la
/// web, desde el enlace del correo.
class PantallaRecuperarClave extends ConsumerStatefulWidget {
  const PantallaRecuperarClave({super.key});

  @override
  ConsumerState<PantallaRecuperarClave> createState() =>
      _PantallaRecuperarClaveState();
}

class _PantallaRecuperarClaveState
    extends ConsumerState<PantallaRecuperarClave> {
  final _formulario = GlobalKey<FormState>();
  final _correo = TextEditingController();
  var _enviando = false;
  ErrorApi? _error;
  String? _enviadoA;

  @override
  void dispose() {
    _correo.dispose();
    super.dispose();
  }

  Future<void> _enviar() async {
    if (_enviando || !_formulario.currentState!.validate()) return;
    setState(() {
      _enviando = true;
      _error = null;
    });
    final correo = _correo.text.trim();
    try {
      await ref.read(repositorioAuthProvider).recuperarClave(correo);
      if (mounted) setState(() => _enviadoA = correo);
    } catch (e) {
      if (mounted) setState(() => _error = ErrorApi.desde(e));
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Olvidé mi clave')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(Espacio.lg),
          child: switch (_enviadoA) {
            final correo? => Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('Revisá tu correo', style: tema.textTheme.titleLarge),
                const SizedBox(height: Espacio.md),
                // El servidor responde igual exista o no la cuenta.
                Text(
                  'Si hay una cuenta con $correo, te enviamos un enlace para '
                  'elegir una clave nueva. Vence en una hora. Después volvé '
                  'a ingresar con la clave nueva.',
                ),
                const SizedBox(height: Espacio.xl),
                FilledButton(
                  onPressed: () => context.go(Rutas.ingreso),
                  child: const Text('Volver al ingreso'),
                ),
              ],
            ),
            null => Form(
              key: _formulario,
              autovalidateMode: AutovalidateMode.onUnfocus,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text(
                    'Escribí el correo de tu cuenta y te enviamos un enlace '
                    'para elegir una clave nueva.',
                  ),
                  const SizedBox(height: Espacio.lg),
                  TextFormField(
                    controller: _correo,
                    validator: validarCorreo,
                    keyboardType: TextInputType.emailAddress,
                    autocorrect: false,
                    autofillHints: const [AutofillHints.email],
                    textInputAction: TextInputAction.done,
                    onFieldSubmitted: (_) => _enviar(),
                    decoration: const InputDecoration(labelText: 'Correo'),
                  ),
                  if (_error case final error?) ...[
                    const SizedBox(height: Espacio.lg),
                    MensajeError(error.mensaje),
                  ],
                  const SizedBox(height: Espacio.xl),
                  FilledButton(
                    onPressed: _enviando ? null : _enviar,
                    child: Text(_enviando ? 'Enviando…' : 'Enviar enlace'),
                  ),
                ],
              ),
            ),
          },
        ),
      ),
    );
  }
}
