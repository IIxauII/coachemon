type MenuResult = { options: { label: string }[] };

export const labels = (menu: MenuResult, h: any) => [menu.options.map(o => o.label), h.optionsContainer];
