import 'package:flutter/material.dart';

/// Campo de clave con un botón para mostrarla mientras se escribe.
class CampoClave extends StatefulWidget {
  const CampoClave({
    super.key,
    required this.controlador,
    required this.validador,
    this.etiqueta = 'Clave',
    this.ayuda,
    this.errorServidor,
    this.esNueva = false,
    this.alCambiar,
    this.alEnviar,
  });

  final TextEditingController controlador;
  final FormFieldValidator<String> validador;
  final String etiqueta;
  final String? ayuda;
  final String? errorServidor;

  /// En el registro: el teclado ofrece guardarla en lugar de completarla.
  final bool esNueva;
  final ValueChanged<String>? alCambiar;
  final VoidCallback? alEnviar;

  @override
  State<CampoClave> createState() => _CampoClaveState();
}

class _CampoClaveState extends State<CampoClave> {
  var _visible = false;

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: widget.controlador,
      validator: widget.validador,
      forceErrorText: widget.errorServidor,
      onChanged: widget.alCambiar,
      obscureText: !_visible,
      autocorrect: false,
      enableSuggestions: false,
      autofillHints: [
        widget.esNueva ? AutofillHints.newPassword : AutofillHints.password,
      ],
      textInputAction: TextInputAction.done,
      onFieldSubmitted: (_) => widget.alEnviar?.call(),
      decoration: InputDecoration(
        labelText: widget.etiqueta,
        helperText: widget.ayuda,
        suffixIcon: IconButton(
          tooltip: _visible ? 'Ocultar clave' : 'Mostrar clave',
          icon: Icon(
            _visible
                ? Icons.visibility_off_outlined
                : Icons.visibility_outlined,
          ),
          onPressed: () => setState(() => _visible = !_visible),
        ),
      ),
    );
  }
}
