import { ChevronDown } from "lucide-react";
import {
  adminNavigationGroups,
  type AdminNavigationGroupId,
  type AdminSectionId
} from "./adminConsoleConfig";

type AdminNavigationProps = {
  activeSection: AdminSectionId;
  expandedGroups: AdminNavigationGroupId[];
  onToggleGroup: (groupId: AdminNavigationGroupId) => void;
  onOpenSection: (sectionId: AdminSectionId) => void;
};

export default function AdminNavigation({
  activeSection,
  expandedGroups,
  onToggleGroup,
  onOpenSection
}: AdminNavigationProps) {
  return (
    <aside className="admin-sidebar">
      <nav className="admin-sidebar-nav" aria-label="后台管理分区">
        {adminNavigationGroups.map((group) => {
          const expanded = expandedGroups.includes(group.id);
          const containsActiveSection = group.items.some((item) => item.id === activeSection);
          const groupItemsId = `admin-nav-items-${group.id}`;
          const GroupIcon = group.icon;
          return (
            <div
              key={group.id}
              className={`admin-nav-group${expanded ? " is-expanded" : ""}${containsActiveSection ? " has-active" : ""}`}
            >
              <button
                type="button"
                className={`admin-nav-group-toggle${containsActiveSection ? " has-active" : ""}`}
                aria-expanded={expanded}
                aria-controls={groupItemsId}
                onClick={() => onToggleGroup(group.id)}
              >
                <span className="admin-nav-group-main">
                  <span className="admin-nav-group-icon" aria-hidden="true">
                    <GroupIcon size={16} />
                  </span>
                  <span className="admin-nav-group-label">{group.label}</span>
                </span>
                <span className="admin-nav-group-meta" aria-hidden="true">
                  <span>{group.items.length}</span>
                  <ChevronDown size={15} />
                </span>
              </button>
              <div id={groupItemsId} className="admin-nav-items" hidden={!expanded}>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={activeSection === item.id ? "is-active" : undefined}
                      aria-current={activeSection === item.id ? "page" : undefined}
                      onClick={() => onOpenSection(item.id)}
                    >
                      <span className="admin-nav-item-icon" aria-hidden="true">
                        <Icon size={14} />
                      </span>
                      <span className="admin-nav-item-label">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
