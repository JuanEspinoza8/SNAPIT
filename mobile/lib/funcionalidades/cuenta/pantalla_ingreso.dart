import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../compartido/errores/mensaje_error.dart';
import '../../compartido/red/error_api.dart';
import '../../compartido/rutas/rutas_app.dart';
import '../../compartido/sesion/sesion.dart';
import '../../compartido/tema/tema_app.dart';
import 'campo_clave.dart';
import 'validaciones.dart';

class PantallaIngreso extends ConsumerStatefulWidget {
  const PantallaIngreso({super.key});

  @override
  ConsumerState<PantallaIngreso> createState() => _PantallaIngresoState();
}

class _PantallaIngresoState extends ConsumerState<PantallaIngreso> {
  final _formulario = GlobalKey<FormState>();
  final _correo = TextEditingController();
  final _clave = TextEditingController();
  var _enviando = false;
  ErrorApi? _error;

  @override
  void dispose() {
    _correo.dispose();
    _clave.dispose();
    super.dispose();
  }

  Future<void> _ingresar() async {
    if (_enviando || !_formulario.currentState!.validate()) return;
    setState(() {
      _enviando = true;
      _error = null;
    });
    try {
      // Si sale bien, el router lleva a la pantalla principal.
      await ref
          .read(sesionProvider.notifier)
          .ingresar(email: _correo.text.trim(), clave: _clave.text);
    } catch (e) {
      if (mounted) setState(() => _error = ErrorApi.desde(e));
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Ingresar a SnapIt')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(Espacio.lg),
          child: Form(
            key: _formulario,
            autovalidateMode: AutovalidateMode.onUnfocus,
            child: AutofillGroup(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  TextFormField(
                    controller: _correo,
                    validator: validarCorreo,
                    keyboardType: TextInputType.emailAddress,
                    autocorrect: false,
                    autofillHints: const [AutofillHints.email],
                    textInputAction: TextInputAction.next,
                    decoration: const InputDecoration(labelText: 'Correo'),
                  ),
                  const SizedBox(height: Espacio.lg),
                  CampoClave(
                    controlador: _clave,
                    validador: validarClaveIngresada,
                    alEnviar: _ingresar,
                  ),
                  if (_error case final error?) ...[
                    const SizedBox(height: Espacio.lg),
                    MensajeError(error.mensaje),
                  ],
                  const SizedBox(height: Espacio.xl),
                  FilledButton(
                    onPressed: _enviando ? null : _ingresar,
                    child: Text(_enviando ? 'Ingresando…' : 'Ingresar'),
                  ),
                  const SizedBox(height: Espacio.sm),
                  TextButton(
                    onPressed: () => context.push(Rutas.recuperarClave),
                    child: const Text('Olvidé mi clave'),
                  ),
                  const Divider(height: Espacio.xxl),
                  OutlinedButton(
                    onPressed: () => context.push(Rutas.registro),
                    child: const Text('Crear una cuenta'),
                  ),
                  const SizedBox(height: Espacio.sm),
                  TextButton(
                    onPressed: () => context.push(Rutas.mapa),
                    child: const Text('Ver el mapa sin ingresar'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
