# The 3D book cover mechanism

Notes on how covers actually get onto the 3D shelf model, why a cover has to
be built a specific way to look right, and the two rendering bugs Claude and
I chased down and fixed while getting Man's Search for Meaning's cover
working. Keeping this in the repo so the next time a cover looks wrong, or
the next book gets rebuilt, the reasoning doesn't have to be rediscovered
from scratch.

Examples throughout use the two books we actually tested this against:
**Man's Search for Meaning** (69 pages, the thinnest book on the shelf) and
**Crime and Punishment** (767 pages, the thickest).

## 1. One 3D model, reused for every book

Every book on the shelf is the same `book2.glb` model, cloned and dressed
differently per book. Its jacket — back cover, spine, front cover — is one
continuous mesh, not three separate pieces. Every point on that surface
carries a UV coordinate from 0 to 1, and the model has always divided that
strip the same way, baked in at export time:

```
U = 0 ────────── 0.44 ── 0.56 ────────── 1.0
      back cover    |  spine |   front cover
```

Whatever image gets uploaded as a cover is stretched across that entire
strip. A plain front-cover photo, uploaded without understanding this, has
its middle — the part meant to sit under someone's thumb — smeared across
the spine. That's why the model always needed wraparound art, not a front
cover crop.

## 2. Making thin books look thin: geometry, not texture

Before any of this, every book rendered at the same spine width regardless
of length. Earlier in the project I had Claude scale each book's geometry
along the "along-the-shelf" axis by a `thickness` factor derived from its
real page count:

```
thickness = clamp(√(pageCount / 300), 0.55, 1.7)

MSFM (69 pages):   √(69/300)  = 0.48  → clamped to 0.55 (the floor)
Crime & P. (767):  √(767/300) = 1.60
```

This part is pure 3D geometry. MSFM's spine face is squeezed to 55% of the
reference width; Crime and Punishment's is stretched to 160%. Nothing about
the *image* changes at this point — the model just physically renders wider
or narrower.

## 3. The problem that created

The mesh's UV split (0.44–0.56 for the spine) never moves — it's baked into
the geometry, independent of any runtime scaling. So MSFM's spine geometry
is squeezed to 55% width, but it's still sampling the exact same middle 12%
slice of whatever image is uploaded. That fixed slice of pixels, crammed
into less physical space, reads as squashed. Crime and Punishment's spine,
stretched to 160% width, samples that same fixed slice and reads as smeared
thin. Neither book's cover art was drawn expecting this, so both looked
wrong once thickness started varying by book.

## 4. The fix: build the file at the book's own proportions, and remap to match

The real fix has two halves, and they only work if they agree with each
other.

**Half A — the file.** Instead of one fixed layout for every book, each
cover now gets built with its spine sized to *that* book's own thickness:

```
coverWidth = 921px (fixed, every book)
spineWidth = 203px × thickness

MSFM:        203 × 0.55 = 112px  →  file is 1954×1200, spine at 921–1033px
Crime & P.:  203 × 1.60 = 325px  →  file is 2167×1200, spine at 921–1246px
```

**Half B — the shader.** A file built this way no longer matches the mesh's
fixed 0.44–0.56 split, so Claude added a custom fragment shader that remaps
the sampling coordinate at render time: it takes the mesh's fixed spine
band and projects it onto wherever the file's own spine actually sits.

Where "wherever the file's own spine actually sits" isn't assumed from a
formula — it's read off the file itself at render time. The shader takes
the cover's real, loaded width and height, computes `spinePx = 203 ×
thickness × (fileHeight / 1200)` against *that* file's own height, and
takes the spine as the literal centre of the image: that many pixels,
centred, with back and front splitting whatever's left over evenly. At
thickness = 1 on a file built exactly to the reference size this lands on
the same 921/203/921 split as before; on any other file it still finds the
spine correctly, because it's derived from the file's real dimensions
rather than an assumption about what they ought to be. (This is also why a
file whose total width is a little off from the formula — which happened
more than once while getting MSFM's cover right — self-corrects instead of
silently misaligning.)

This remap only runs for a book explicitly flagged `cover_calibrated =
true` in the `books` table. Every other book — Crime and Punishment's
current cover included, which is still just a plain front-cover photo, not
built to this convention at all — skips the remap entirely and renders
exactly as it always did. That flag exists specifically so a half-migrated
catalogue doesn't get its ordinary covers carved up along boundaries that
mean nothing in their actual files. (This is what caused Moby Dick's spine
to briefly read "ELVIL" instead of "MELVILLE" — the remap running on a
cover it was never built for.)

## 5. Bug #1: measuring the wrong slice of geometry

The shader needs to know exactly where on the mesh the spine band sits.
Claude measured this by finding the model's vertices sitting on its
flattest, most spine-like surface. But the spine isn't perfectly flat — it
curves gently into the front and back covers at a rounded edge, and that
curved rim is still facing the camera on a shelf. The first measurement
only captured the dead-flat center, so the curved edges technically had UV
values *outside* the measured range — meaning they skipped the remap
entirely and sampled straight from the unmodified cover formula, which is
exactly where cover art leaked onto what visually reads as spine.

Fixed by widening that measurement to properly include the curve — found by
sweeping the tolerance from 5% up to 50% and watching where the numbers
stopped changing. They plateau at 10%; the shipped value is 20%, inside
that plateau with room either side.

## 6. Bug #2: tricking the GPU's own blur

Even with the boundary measured correctly, the real photo still showed a
wide smear that a plain solid-color test Claude built to check the math
never revealed. The reason: the remap is three straight-line segments
stitched together, and its *rate of change* jumps abruptly right at each
seam. GPUs use exactly that rate of change to decide how blurry a mipmap
level to sample from — a sudden jump reads as "this texture is changing
very fast right here," so it grabbed a far blurrier level than the
surface's actual geometry called for, smearing real detail from
neighboring image content across a band much wider than ordinary filtering
ever would. A flat solid color hides this almost completely, which is
exactly why the labelled test kept passing while the real photo — with
vivid sunset detail sitting right next to flat blue — kept failing.

The fix: compute that blur amount from the *original*, smooth coordinate
before any remapping happens, and hand it to the GPU explicitly
(`textureGrad`) instead of letting it guess from the already-distorted
remapped one.

## 7. Bug #3: the first bleed fix quietly stretched the art

`textureGrad` alone still left a visible sliver of bleed — the seam was
right, the blur amount was closer to correct, but a genuinely narrow spine
(MSFM's is barely 112px) means even ordinary, non-artifact filtering blur
eats a real fraction of it. The first attempt to close that gap sampled a
*smaller* window than `[f1, f2]` — a small margin taken off both edges — on
the theory that giving the blur more room to land on spine, not cover,
would hide the rest of the seam.

It worked, for bleed. But it has a cost that isn't obvious until you look
at anything round: the sampled window got narrower while the rendered
*geometry* stayed exactly as wide as the thickness formula says it should.
Fewer source pixels, stretched across the same physical space, is a
horizontal-only zoom. Text hides that reasonably well — a reader's eye
doesn't measure letterforms. A circular logo mark doesn't hide it at all;
it renders as a visibly wider ellipse, worse the bigger the margin. That
mismatch is what showed up on Man's Search for Meaning's spine — the small
circular logo at the bottom stretched into an oval.

The fix keeps the width fix (bug #1) and the mip fix (bug #2), and drops
the margin entirely — every crop is sampled at exactly its own true width,
so nothing shrinks unevenly and nothing stretches. In its place, the
gradient handed to `textureGrad` is scaled down a little (×0.6) before the
lookup. That biases the GPU toward a sharper mip *without moving which
pixel gets sampled* — it can only ever narrow the blur, never reintroduce
the margin's zoom, because it never touches the sampling coordinate at
all.

## 8. Bug #4: measuring the mesh after it had already been moved

Bug #3's fix removed the margin, and the seam bled cleanly on a plain test
image. But a real cover still came back stretched — this time reproducibly,
not just on one logo. A controlled solid-colour circle, painted onto the
spine as a stand-in for the logo, measured as a visibly wide ellipse in one
view and, confusingly, a *tall* ellipse in another. Something more basic
than any of the first three bugs was still wrong.

`measureSpineBand` finds the spine's UV boundary by looking at which
vertices sit on the model's flattest, most spine-like plane. To compare
those vertices meaningfully it has to carry them through whatever transform
the mesh's node has — the same reasoning as `book.size`, which
`measureBookBody` gets right by using `Box3.setFromObject` (always
world-space). Making `measureSpineBand` match that seemed like the fix, and
made the numbers move, but they still didn't agree with `book.size`.

The reason: by the time `measureSpineBand` runs, `root` (the clone this
book renders from) is no longer sitting where `measureBookBody` measured
it. It's already a child of a wrapper carrying that book's own yaw, its
non-uniform `thickness` scale, and wherever it landed on the shelf. Full
scene world space includes all of that — so the "spine boundary" being
measured shifted depending on the book's thickness and which shelf slot it
was in, while `book.size` was measured earlier, on a bare, freshly cloned
root with none of it applied yet. Two different coordinate frames, again —
just one level removed from bug #1's version of the same mistake.

The fix isn't world space or local space — it's root space: every vertex
carried through `mesh.matrixWorld`, then through `root.matrixWorld`
inverted, which cancels out exactly the part that isn't intrinsic to the
model (the wrapper's rotation, its thickness scale, its shelf position) and
leaves only the internal node-to-node transform between root and the
jacket mesh. That's the same frame `measureBookBody` sees, because it also
runs before any of those outer transforms exist. Confirmed against the
controlled circle test: it now measures round to within the noise of the
spine's own lighting gradient, both dead-on and at an angle, and the real
cover's logo mark reads as a circle again instead of an ellipse.

## 9. Bug #5: the spine isn't flat, and no shader math fixes that

Bug #4 fixed the measurement, and it fixed most of the stretch — but a
controlled circle painted onto the spine still came back a consistent
~15-20% wider than tall, in every test: dead centre in the camera's view
(where perspective is symmetric and shouldn't skew anything), off to the
shelf's edge, and across circles of several different sizes safely inside
the spine's width. Nothing about *where* you looked at it or *how big* the
circle was moved that number — which ruled out camera perspective and
edge-clipping as the cause.

It also wasn't the mip-selection math from bug #2. That fix had used one
flat, eyeballed scale (`× 0.6`) on both the U and V gradients fed to
`textureGrad`, when only U is actually remapped — V passes through
untouched and never needed correcting at all. Replacing that flat guess
with the remap's own real local slope (computed directly, not tuned by
eye) is a genuine correctness fix on its own, and it's still worth having
— but re-running the circle test with it made zero measurable difference,
pixel for pixel. Whatever was stretching the circle wasn't blur.

Measuring the actual rendered geometry settled it: the spine crop's real
on-screen width, compared against the jacket's real on-screen height, and
the pixel-density formula sizing the crop, agreed with each other to
within 0.1%. The *sampling math was correct*. What's left is the model
itself — book2.glb's spine isn't a flat plane, it bulges gently toward the
viewer, and a bulge's midpoint sits physically closer to the camera than a
straight-line measurement between its two edges suggests. That reads as
extra magnification along the spine's width specifically, since its height
is basically flat and gets no such boost. It's a property of the curve,
not of any texture math, which is exactly why no amount of shader tuning
touched it.

The first-principles fix would be re-exporting a flatter spine, or
measuring true arc length instead of straight-line distance. The pragmatic
one, and the one shipped here: sample a correspondingly wider slice of the
file's own spine art, so the extra screen area the curve creates gets
filled with real detail instead of the same pixels stretched thinner.
`SPINE_CURVE_MAGNIFICATION` in `lib/bookModel.ts` is that correction —
`1.17`, calibrated directly against the circle test, not derived from
first principles. Confirmed afterward: the circle renders at exactly 1:1
width-to-height, both dead centre and at the shelf's default angle, and
the real cover's logo mark reads as a circle again. It's tied to this
specific model's specific curve — if book2.glb is ever re-exported with a
flatter spine, re-measure with a plain painted-on circle before assuming
`1.17` is still right.

## The full picture, for a calibrated book

1. Geometry is scaled by `thickness`, computed from page count.
2. The shader remaps the sample window to the file's own real spine crop —
   read from the file's actual dimensions, not assumed (bug #3's fix).
3. That remap is measured against the true, curve-inclusive spine boundary
   on the mesh side (bug #1's fix).
4. The GPU blurs using the real, undistorted rate of change, biased a
   little sharper, rather than an artifact of the remap's own math (bug
   #2's fix) — and never by sampling a narrower window, so nothing stretches.
5. That spine boundary is itself measured in the model's own intrinsic
   frame — relative to root, not full-scene world space — so it doesn't
   drift with a book's thickness or shelf position (bug #4's fix).

For every other book, none of that runs — it's the same plain texture
stretch the app always used, waiting for its own cover to be rebuilt the
same way MSFM's was: `2 × 921px` covers, spine width `= 203px × thickness`,
`cover_calibrated` flipped to `true` once the file is uploaded.

— Aaron, with Claude
