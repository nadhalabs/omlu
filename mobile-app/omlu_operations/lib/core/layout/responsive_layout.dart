enum OmluLayoutClass { phone, tablet, expanded }

OmluLayoutClass omluLayoutClass(double availableWidth) {
  if (availableWidth < 600) return OmluLayoutClass.phone;
  if (availableWidth <= 1000) return OmluLayoutClass.tablet;
  return OmluLayoutClass.expanded;
}

bool usePersistentNavigation(double availableWidth) =>
    omluLayoutClass(availableWidth) != OmluLayoutClass.phone;

bool useSplitView(double availableWidth) => availableWidth >= 760;
