// uplodah - Simple and modern universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import type { ReactNode } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  IconButton,
  Stack,
  Typography,
} from '@mui/material';
import { ContentCopy as ContentCopyIcon, EditNote } from '@mui/icons-material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

/**
 * A command example displayed inside the command examples accordion.
 */
interface CommandExamplesAccordionItem {
  /**
   * Label shown before the command body.
   */
  label: ReactNode;
  /**
   * Command text shown in the panel and copied when the action is triggered.
   */
  command: string;
  /**
   * Accessible label for the copy button associated with the command.
   */
  copyAriaLabel: string;
  /**
   * Preserves line breaks when the command is shown.
   */
  preserveWhitespace?: boolean;
}

/**
 * Props for the command examples accordion.
 */
interface CommandExamplesAccordionProps {
  /**
   * Title displayed in the accordion summary row.
   */
  title: ReactNode;
  /**
   * Command examples rendered in the accordion body.
   */
  commands: readonly CommandExamplesAccordionItem[];
  /**
   * Invoked when a command copy button is pressed.
   */
  onCopyCommand: (command: string) => void | Promise<void>;
}

/**
 * Shows API usage commands inside a collapsible accordion.
 */
const CommandExamplesAccordion = ({
  title,
  commands,
  onCopyCommand,
}: CommandExamplesAccordionProps) => {
  return (
    <Accordion
      disableGutters
      elevation={0}
      sx={{
        backgroundColor: (theme) =>
          theme.palette.mode === 'light' ? 'primary.50' : 'grey.900',
        borderColor: (theme) =>
          theme.palette.mode === 'light' ? 'primary.100' : 'grey.800',
        borderWidth: 1,
        borderStyle: 'solid',
        '&::before': {
          display: 'none',
        },
      }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <EditNote fontSize="small" />
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ fontSize: '1.3rem' }}
          >
            {title}
          </Typography>
        </Stack>
      </AccordionSummary>
      <AccordionDetails sx={{ pt: 0 }}>
        {commands.map((command, index) => (
          <Box
            key={command.copyAriaLabel}
            sx={{
              display: 'flex',
              alignItems: 'flex-start',
              mt: index === 0 ? 0 : 1,
            }}
          >
            <Typography
              variant="body2"
              sx={{
                minWidth: '8rem',
                fontWeight: 600,
              }}
            >
              {command.label}
            </Typography>
            <Typography
              variant="body2"
              sx={{
                ml: '1rem',
                flexGrow: 1,
                fontFamily: 'monospace',
                fontSize: '0.95rem',
                wordBreak: 'break-all',
                ...(command.preserveWhitespace
                  ? { whiteSpace: 'pre-wrap' }
                  : {}),
              }}
            >
              {command.command}
            </Typography>
            <IconButton
              size="large"
              onClick={() => {
                void onCopyCommand(command.command);
              }}
              aria-label={command.copyAriaLabel}
              sx={{ ml: 1, marginRight: '1rem' }}
            >
              <ContentCopyIcon fontSize="small" />
            </IconButton>
          </Box>
        ))}
      </AccordionDetails>
    </Accordion>
  );
};

export default CommandExamplesAccordion;
