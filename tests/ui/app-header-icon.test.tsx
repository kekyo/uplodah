// uplodah - Universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import AppHeaderIcon from '../../src/ui/components/AppHeaderIcon';

describe('app header icon', () => {
  test('renders the favicon svg image', () => {
    const markup = renderToStaticMarkup(<AppHeaderIcon />);

    expect(markup).toContain('img');
    expect(markup).toContain('favicon.svg');
  });
});
