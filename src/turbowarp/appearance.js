// Presentation metadata stays outside snapshots, drafts and saved project data.
const readBlockEditorAppearance = (block, ScratchBlocks) => {
    const appearance = {};
    if (!block) return appearance;
    try {
        // Use the block's own labels, without reading JSON or other values from connected inputs.
        const name = block.inputList.filter(input => input.type !== ScratchBlocks.NEXT_STATEMENT)
            .map(input => input.fieldRow.filter(field => !(field instanceof ScratchBlocks.FieldImage))
                .map(field => field.getText())
                .join(' '))
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();
        if (name) appearance.name = name;
    } catch (error) {
        // The opcode remains available as a name fallback.
    }
    try {
        const colour = block.getColour();
        if (typeof colour === 'string' && /^#[0-9a-f]{6}$/i.test(colour)) {
            appearance.colour = colour;
            const channels = [1, 3, 5].map(offset => parseInt(colour.slice(offset, offset + 2), 16));
            appearance.tint = `rgba(${channels.join(', ')}, 0.08)`;
        }
    } catch (error) {
        // Missing presentation data must not prevent opening an otherwise editable tree.
    }
    try {
        const input = block.inputList[0];
        const field = input && input.fieldRow[0];
        if (field instanceof ScratchBlocks.FieldImage) {
            const uri = field.getValue();
            if (typeof uri === 'string' && uri.trim()) appearance.iconURI = uri;
        }
    } catch (error) {
        // Keep the colour even when the leading image is unavailable.
    }
    return appearance;
};

export default readBlockEditorAppearance;
