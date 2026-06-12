import { IsString, Length } from "class-validator";

/**
 * Body for `POST /api/annotations` — attach a margin-style note to a
 * specific `ChapterBlock`.
 *
 * Annotations are private to the user and visible only in the
 * Annotations panel of the reader. For longer reflective writing, the
 * Diary is the right model — Annotations stay short and contextual.
 */
export class CreateAnnotationDto {
  /**
   * Stable ID of the `ChapterBlock` the annotation anchors to. Same
   * resilience as highlights: the annotation stays attached even if the
   * block content is later edited by the author.
   */
  @IsString()
  @Length(1, 64)
  blockId!: string;

  /**
   * Annotation body. 1–4096 chars (~1000 words). Plaintext — annotations
   * are NOT E2E encrypted because books are public content and the
   * reflection here is contextual. Users who need privacy for personal
   * reflection should use the Diary (which IS E2E).
   */
  @IsString()
  @Length(1, 4096)
  text!: string;
}

/**
 * Body for `PATCH /api/annotations/:id` — edit an existing annotation.
 * Only the text changes; the block anchor is immutable (delete + recreate
 * if the user wants to move the note elsewhere).
 */
export class UpdateAnnotationDto {
  /**
   * New annotation body. Same constraints as creation (1–4096 chars).
   */
  @IsString()
  @Length(1, 4096)
  text!: string;
}
