"use client";

import { useBase } from "./context";
import { GridView } from "./GridView";
import { KanbanView } from "./KanbanView";
import { CalendarView } from "./CalendarView";
import { GalleryView } from "./GalleryView";
import { FormBuilder } from "./FormBuilder";

export function ViewRenderer() {
  const { view } = useBase();
  switch (view.type) {
    case "kanban":
      return <KanbanView />;
    case "calendar":
      return <CalendarView />;
    case "gallery":
      return <GalleryView />;
    case "form":
      return <FormBuilder />;
    default:
      return <GridView />;
  }
}
