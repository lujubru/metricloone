# Actualizaciones pendientes

## Conexión directa de Instagram sin Página de Facebook

**Estado:** pendiente; no implementado.

Meta ofrece Instagram API with Unified Login, que permite al usuario iniciar sesión con Instagram o Facebook sin vincular una Página de Facebook. La cuenta debe ser profesional (Business o Creator) y el portfolio comercial debe compartirla durante la autorización.

### Configuración prevista en Meta for Developers

- La app debe usar el caso de uso **Manage messaging & content on Instagram** y estar asociada a un portfolio comercial.
- Configurar Instagram API with Unified Login y crear una configuración que solicite la cuenta de Instagram.
- Solicitar únicamente los permisos necesarios para las funciones que se vayan a ofrecer. Para métricas de Reels se necesita también `instagram_manage_insights`; anuncios y cuentas publicitarias no son necesarios para publicar ni leer insights orgánicos.
- Registrar una URL HTTPS de callback que exista en la aplicación. Una ruta propuesta es `https://metricool.pixeldesarrollo.com/api/connect/instagram/callback`, pero **no registrarla ni usarla hasta implementar ese endpoint**.
- La URL actual `https://metricool.pixeldesarrollo.com/api/auth/callback/facebook` pertenece a NextAuth y no implementa este flujo.
- En modo Development, agregar la cuenta profesional de prueba como Instagram Tester y aceptar la invitación. Para clientes sin rol en la app se necesitará el acceso avanzado y la revisión de Meta correspondiente.

### Trabajo de implementación necesario

- Añadir OAuth de Unified Login con `config_id`, validación de `state`, callback e intercambio seguro del código por el token.
- Guardar y renovar el tipo de token que entrega Unified Login sin exponerlo al navegador.
- Incorporar la cuenta autorizada al tenant y adaptar publicación, inbox, webhooks y consultas de insights para usar el token y los endpoints de ese flujo.
- Mantener la conexión actual mediante Facebook/Página como opción compatible durante la transición.

La conexión actual del proyecto sigue usando Facebook Login, guarda una `FbConnection` y descubre Instagram a través de las Páginas. Configurar Unified Login en Meta por sí solo no cambia el comportamiento de la aplicación.
