import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../compartido/rutas/rutas_app.dart';
import '../../compartido/sesion/sesion.dart';
import '../../compartido/sesion/usuario.dart';
import '../../compartido/tema/modo_tema.dart';
import '../../compartido/tema/tema_app.dart';
import '../mis_reportes/pantalla_mis_reportes.dart';
import '../mis_reportes/repositorio_mis_reportes.dart';
import '../recorrido/elegir_perfil_movilidad.dart';

const _meses = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/// «febrero 2026».
String mesYAnio(DateTime fecha) {
  final local = fecha.toLocal();
  return '${_meses[local.month - 1]} ${local.year}';
}

/// Las iniciales del nombre: de la primera y la última palabra, como en la web.
String iniciales(String nombre) {
  final palabras = nombre.trim().split(RegExp(r'\s+'));
  if (palabras.first.isEmpty) return '?';
  final primera = palabras.first[0];
  final ultima = palabras.length > 1 ? palabras.last[0] : '';
  return (primera + ultima).toUpperCase();
}

/// «Mi perfil», una sección de la barra de abajo: arriba los datos con
/// «Editar perfil», desde cuándo es miembro y cuántos reportes hizo; abajo, si
/// es vecino, sus reportes. Los ajustes de la cuenta (tema, avisos, movilidad
/// y salir) los abre la rueda de la barra de arriba ([mostrarAjustesCuenta]).
class ContenidoPerfil extends ConsumerWidget {
  const ContenidoPerfil({super.key, required this.alReportar});

  /// Lleva a la sección «Reportar», desde la lista vacía.
  final VoidCallback alReportar;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final usuario = ref.watch(sesionProvider).value;
    // Sin sesión el router ya está llevando al ingreso.
    if (usuario == null) return const SizedBox.shrink();
    final esVecino = usuario.rol == Rol.vecino;
    final tema = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.all(Espacio.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  CircleAvatar(
                    radius: 36,
                    backgroundColor: tema.colorScheme.primary,
                    foregroundColor: tema.colorScheme.onPrimary,
                    child: Text(
                      iniciales(usuario.nombre),
                      style: tema.textTheme.titleLarge?.copyWith(
                        color: tema.colorScheme.onPrimary,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  const SizedBox(width: Espacio.lg),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          usuario.nombre,
                          style: tema.textTheme.titleLarge?.copyWith(
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        Text(
                          usuario.email,
                          style: tema.textTheme.bodyMedium?.copyWith(
                            color: tema.colorScheme.onSurfaceVariant,
                          ),
                        ),
                        const SizedBox(height: Espacio.xs),
                        Text(
                          usuario.rol.etiqueta,
                          style: tema.textTheme.labelMedium,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: Espacio.lg),
              OutlinedButton(
                onPressed: () => context.push(Rutas.editarPerfil),
                child: const Text('EDITAR PERFIL'),
              ),
              const SizedBox(height: Espacio.md),
              if (usuario.creadoEn case final alta?)
                _Dato(
                  icono: Icons.calendar_month_outlined,
                  texto: 'Miembro desde ${mesYAnio(alta)}',
                ),
              if (esVecino) const _CantidadReportes(),
            ],
          ),
        ),
        if (esVecino) ...[
          _PestanaReportes(),
          Expanded(child: PantallaMisReportes(alReportar: alReportar)),
        ] else
          Padding(
            padding: const EdgeInsets.all(Espacio.lg),
            child: Text(
              'Los reportes los hacen los vecinos: desde tu rol '
              'gestionás los de tu organismo.',
              style: tema.textTheme.bodyMedium?.copyWith(
                color: tema.colorScheme.onSurfaceVariant,
              ),
            ),
          ),
      ],
    );
  }
}

class _Dato extends StatelessWidget {
  const _Dato({required this.icono, required this.texto});

  final IconData icono;
  final String texto;

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: Espacio.xs),
      child: Row(
        children: [
          Icon(icono, size: 18, color: tema.colorScheme.onSurfaceVariant),
          const SizedBox(width: Espacio.sm),
          // En una pantalla angosta, o con letra grande, baja de renglón.
          Flexible(child: Text(texto, style: tema.textTheme.bodyMedium)),
        ],
      ),
    );
  }
}

/// «3 Reportes», de la misma consulta que la lista: no hace otro pedido.
class _CantidadReportes extends ConsumerWidget {
  const _CantidadReportes();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cantidad = ref.watch(misReportesProvider).value?.length;
    if (cantidad == null) return const SizedBox.shrink();
    final tema = Theme.of(context);
    return Text.rich(
      TextSpan(
        children: [
          TextSpan(
            text: '$cantidad ',
            style: const TextStyle(fontWeight: FontWeight.w700),
          ),
          TextSpan(text: cantidad == 1 ? 'Reporte' : 'Reportes'),
        ],
      ),
      style: tema.textTheme.bodyMedium,
    );
  }
}

/// La pestaña «Reportes», subrayada, como separador de la lista.
class _PestanaReportes extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border(
          top: BorderSide(color: tema.dividerColor),
          bottom: BorderSide(color: tema.colorScheme.primary, width: 2),
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: Espacio.md),
        child: Semantics(
          header: true,
          child: Text(
            'Reportes',
            textAlign: TextAlign.center,
            style: tema.textTheme.titleSmall?.copyWith(
              color: tema.colorScheme.primary,
            ),
          ),
        ),
      ),
    );
  }
}

/// Los ajustes de la cuenta: tema, avisos, perfil de movilidad y salir.
void mostrarAjustesCuenta(
  BuildContext context,
  WidgetRef ref,
  Usuario usuario,
) {
  showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    builder: (contexto) => SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(
          Espacio.lg,
          0,
          Espacio.lg,
          Espacio.lg,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Consumer(
              builder: (_, ref, _) => SwitchListTile(
                contentPadding: EdgeInsets.zero,
                secondary: const Icon(Icons.dark_mode_outlined),
                title: const Text('Tema oscuro'),
                value: ref.watch(modoTemaProvider) == ThemeMode.dark,
                onChanged: (oscuro) =>
                    ref.read(modoTemaProvider.notifier).elegir(oscuro: oscuro),
              ),
            ),
            if (usuario.rol == Rol.vecino) ...[
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.notifications_outlined),
                title: const Text('Avisos y zonas'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () {
                  Navigator.of(contexto).pop();
                  context.push(Rutas.ajustesAvisos);
                },
              ),
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.directions_walk),
                title: const Text('Perfil de movilidad'),
                subtitle: const Text('Elegí cómo te movés en los recorridos.'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => mostrarElegirPerfilMovilidad(contexto),
              ),
            ],
            const SizedBox(height: Espacio.lg),
            OutlinedButton.icon(
              icon: const Icon(Icons.logout),
              label: const Text('Salir'),
              onPressed: () {
                Navigator.of(contexto).pop();
                ref.read(sesionProvider.notifier).salir();
              },
            ),
          ],
        ),
      ),
    ),
  );
}
