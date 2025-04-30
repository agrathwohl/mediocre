# Observations

## Time Signature
- The best way to ensure a non-standard time signature is used is to explicitly
call out a particular style or individual associated with that non-standard time signature.
For example, to achieve 7/8 you can designate "Venetian Snares" or for 3/4, you could
request "Waltz".

## Arrangement
- Instrumentation is not always respected because of the differences between an instrument
and its name on the MIDI soundfont being used by Timidity. To overcome this, explicitly
designate the instrument by its soundfont title, or again, as above, make mention of a style
or individual associated with the desired instrument. To ensure there's a gritty electric
guitar, specify "Hardcore" as one of the modern genres. Or to definitely get a saxophone,
specify "Coltrane."

- If you want to guarantee a drum beat rather than a classical-style percussion, you can
state as the `-s` parameter, "Dance Music" if you find that a particular genre or instrumentalist
does not achieve the desired results.

## Range of Inputs
- The prompts can be pretty wide-ranging while remaining effective. In the "classical" args you
can include not just composers' names and genres. You can include period instruments (i.e., "viola de gamba",
"harpsichord"), or specific classical music schools (i.e., "The Second Vianese School").

- Remember that there are particular arguments for `--producer` (to specify the sound of a particular
well-known record producer like "Quincy Jones", "Phil Spector", and "Rick Rubin"), and `--record-label`
to specify the sound of a particular label, such as "PC Music", "Tzadik Records", and "Hyperdub". This
should free up your `-M` argument for specifically the modern qualities you want that are not able to
be specified in any other way.


## DRM
- Anthropic is pretty damn lame in that they have a very holier-than-thou DRM filter that is
way, way too sensitive. It has rejected "John Cage x Alva Noto" before while "a complete carbon copy
of a song from The Beatles - White Album" has been handled by Claude with no issues (though the output,
to its "credit", sucked.) If you find that the DRM filter is hitting you there is not much you can do about
it however I would **not** recommend trying your query again because it is likely to fail and get the attention
of the Anthropic ban hammer. I don't think you want those lame nerds passing judgment upon you in this way,
if you get banned from using Claude who knows what other organizations will find out about that and use it
against you. Don't become debanked just because you want to hear your favorite Backstreet Boys song
being played on the mandolin.
