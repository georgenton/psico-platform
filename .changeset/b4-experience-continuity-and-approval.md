---
"@psico/types": minor
"@psico/api-client": minor
---

Experience: continuidad histórica y aprobación editorial comprobable.

`@psico/types` suma tres formas, todas aditivas y opcionales:
`ChapterExperiencePublicView.startable` —si un pin admite recorridos nuevos,
que es una pregunta distinta de si está publicado—,
`ExperiencePublicationVerdict` y `AdminExperienceDraft.publication`, que
llevan a la interfaz el mismo veredicto editorial que aplica el servidor.

`@psico/api-client` suma `experienceApi.getOwnByPin`: la experiencia que esta
persona ya empezó, por identidad exacta, para que retirar una de la oferta
deje de quitarle el camino a quien ya tiene un recorrido en ella. Autoriza la
propiedad, comprobada en el servidor; sin sesión propia responde 404.

Nada de esto cambia una firma existente: un consumidor anterior compila igual
y lee los campos nuevos como ausentes, que es como debe leerlos.
