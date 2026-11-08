import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../compartido/errores/mensaje_error.dart';
import '../../compartido/formato/fechas.dart';
import '../../compartido/red/error_api.dart';
import '../../compartido/tema/tema_app.dart';
import 'carrusel_fotos.dart';
import 'social.dart';
import 'widgets_social.dart';

/// La foto de un vecino dentro de un incidente: quién la subió, qué dijo, sus
/// me gusta y sus comentarios.
class PantallaReporte extends ConsumerWidget {
  const PantallaReporte(this.id, {super.key});

  final int id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final reporte = ref.watch(reporteProvider(id));
    return Scaffold(
      appBar: AppBar(
        title: Text(
          reporte.value == null
              ? 'Reporte'
              : 'Reporte del ${reporte.value!.autor.nombre}',
        ),
      ),
      body: SafeArea(
        child: switch (reporte) {
          AsyncData(:final value) => _Contenido(value),
          AsyncError(:final error) when !reporte.isLoading => Padding(
            padding: const EdgeInsets.all(Espacio.lg),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                MensajeError(ErrorApi.desde(error).mensaje),
                const SizedBox(height: Espacio.lg),
                OutlinedButton(
                  onPressed: () => ref.invalidate(reporteProvider(id)),
                  child: const Text('Reintentar'),
                ),
              ],
            ),
          ),
          _ => const Center(
            child: CircularProgressIndicator(
              semanticsLabel: 'Cargando el reporte',
            ),
          ),
        },
      ),
    );
  }
}

class _Contenido extends StatelessWidget {
  const _Contenido(this.reporte);

  final ReportePublico reporte;

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    return ListView(
      children: [
        Padding(
          padding: const EdgeInsets.all(Espacio.lg),
          child: Row(
            children: [
              AvatarAutor(reporte.autor, radio: 20),
              const SizedBox(width: Espacio.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      reporte.autor.nombre,
                      style: tema.textTheme.titleMedium,
                    ),
                    Text(
                      haceCuanto(reporte.creadoEn),
                      style: tema.textTheme.bodySmall?.copyWith(
                        color: tema.colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        CarruselFotos(
          fotoIds: reporte.fotoIds,
          descripcion: 'el reporte del ${reporte.autor.nombre}',
        ),
        Padding(
          padding: const EdgeInsets.all(Espacio.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Align(
                alignment: Alignment.centerLeft,
                child: ContadoresSociales(
                  meGusta: reporte.cantidadMeGusta,
                  comentarios: reporte.cantidadComentarios,
                ),
              ),
              if (reporte.descripcion case final descripcion?
                  when descripcion.trim().isNotEmpty) ...[
                const SizedBox(height: Espacio.md),
                Text(descripcion),
              ],
              const Divider(height: Espacio.xxl),
              SeccionComentarios(
                titulo: 'Comentarios',
                provider: comentariosDeReporteProvider(reporte.id),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
