import { AssistantsStudio } from "./AssistantsStudio";
import { ImageStudio } from "./ImageStudio";
import { MindmapStudio } from "./MindmapStudio";
import { PptStudio } from "./PptStudio";
import { TranslateStudio } from "./TranslateStudio";
import type { StudioModuleProps } from "./studioShared";

function StudioModule(props: StudioModuleProps) {
  switch (props.moduleId) {
    case "image":
      return <ImageStudio {...props} />;
    case "ppt":
      return <PptStudio {...props} />;
    case "mindmap":
      return <MindmapStudio {...props} />;
    case "assistants":
      return <AssistantsStudio {...props} />;
    case "translate":
      return <TranslateStudio {...props} />;
  }
}

export default StudioModule;
