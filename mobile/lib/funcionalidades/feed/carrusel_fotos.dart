import 'package:flutter/material.dart';

import '../../compartido/tema/tema_app.dart';
import '../../config/entorno.dart';

/// Las fotos de un incidente a todo el ancho, en 4:3, pasándolas con el
/// dedo. Arriba a la derecha dice cuál se ve; abajo, un punto por foto.
class CarruselFotos extends StatefulWidget {
  const CarruselFotos({
    super.key,
    required this.fotoIds,
    required this.descripcion,
    this.cantidadTotal,
  });

  final List<int> fotoIds;

  /// De qué son las fotos, para TalkBack: «Bache».
  final String descripcion;

  /// Cuántas tiene el incidente, si son más que [fotoIds]: la última avisa
  /// que el resto está en el detalle.
  final int? cantidadTotal;

  @override
  State<CarruselFotos> createState() => _CarruselFotosState();
}

class _CarruselFotosState extends State<CarruselFotos> {
  var _actual = 0;

  @override
  Widget build(BuildContext context) {
    final fotos = widget.fotoIds;
    if (fotos.isEmpty) return _SinFotos(widget.descripcion);

    final restantes = (widget.cantidadTotal ?? fotos.length) - fotos.length;
    final fijos = Theme.of(context).extension<ColoresFijos>()!;

    return AspectRatio(
      aspectRatio: 4 / 3,
      child: Stack(
        fit: StackFit.expand,
        children: [
          PageView.builder(
            itemCount: fotos.length,
            onPageChanged: (pagina) => setState(() => _actual = pagina),
            itemBuilder: (_, i) => FotoIncidente(
              fotos[i],
              descripcion:
                  'Foto ${i + 1} de ${fotos.length} de ${widget.descripcion}',
            ),
          ),
          if (fotos.length > 1)
            Positioned(
              top: Espacio.sm,
              right: Espacio.sm,
              child: ExcludeSemantics(
                child: _Pastilla('${_actual + 1}/${fotos.length}'),
              ),
            ),
          if (restantes > 0 && _actual == fotos.length - 1)
            Positioned(
              left: Espacio.sm,
              // Por encima de los puntos, para que no se pisen.
              bottom: Espacio.xl,
              child: _Pastilla(
                restantes == 1
                    ? '+1 foto en el detalle'
                    : '+$restantes fotos en el detalle',
              ),
            ),
          if (fotos.length > 1)
            Positioned(
              left: 0,
              right: 0,
              bottom: Espacio.sm,
              child: ExcludeSemantics(
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    for (var i = 0; i < fotos.length; i++)
                      AnimatedContainer(
                        duration: const Duration(milliseconds: 200),
                        width: i == _actual ? 8 : 6,
                        height: i == _actual ? 8 : 6,
                        margin: const EdgeInsets.symmetric(horizontal: 3),
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: i == _actual
                              ? fijos.sobreVelo
                              : fijos.sobreVelo.withValues(alpha: 0.5),
                          boxShadow: [
                            BoxShadow(color: fijos.velo, blurRadius: 2),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Texto chico sobre la foto, con el velo para que se lea sobre cualquier
/// imagen.
class _Pastilla extends StatelessWidget {
  const _Pastilla(this.texto);

  final String texto;

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    final fijos = tema.extension<ColoresFijos>()!;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: fijos.velo,
        borderRadius: BorderRadius.circular(radioBorde),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: Espacio.sm,
          vertical: 2,
        ),
        child: Text(
          texto,
          style: tema.textTheme.labelSmall?.copyWith(color: fijos.sobreVelo),
        ),
      ),
    );
  }
}

class _SinFotos extends StatelessWidget {
  const _SinFotos(this.descripcion);

  final String descripcion;

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    return AspectRatio(
      aspectRatio: 4 / 3,
      child: ColoredBox(
        color: tema.colorScheme.surfaceContainerLow,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.image_not_supported_outlined,
              size: 40,
              color: tema.colorScheme.onSurfaceVariant,
            ),
            const SizedBox(height: Espacio.sm),
            Text(
              'Sin fotos para mostrar',
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

/// Una foto pública de `GET /fotos/:id`, recortada para llenar su lugar.
class FotoIncidente extends StatelessWidget {
  const FotoIncidente(this.id, {super.key, required this.descripcion});

  final int id;
  final String descripcion;

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    Widget recuadro({Widget? child}) => ColoredBox(
      color: tema.colorScheme.surfaceContainerLow,
      child: Center(child: child),
    );

    // La descripción queda aunque la foto no cargue.
    return Semantics(
      container: true,
      image: true,
      label: descripcion,
      child: Image.network(
        '${Entorno.apiUrl}/fotos/$id',
        fit: BoxFit.cover,
        excludeFromSemantics: true,
        loadingBuilder: (_, imagen, progreso) =>
            progreso == null ? imagen : recuadro(),
        errorBuilder: (_, _, _) => recuadro(
          child: Text(
            'No se pudo cargar la foto',
            style: tema.textTheme.bodySmall?.copyWith(
              color: tema.colorScheme.onSurfaceVariant,
            ),
          ),
        ),
      ),
    );
  }
}
